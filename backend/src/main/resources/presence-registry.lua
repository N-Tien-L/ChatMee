-- All registry keys share one hash tag. Redis time owns the grace deadline.
local prefix = ARGV[1]
local operation = ARGV[2]
local instance = ARGV[3]
local ttl = tonumber(ARGV[4])
local grace = tonumber(ARGV[5])
local user = ARGV[6]
local session = ARGV[7]
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local online = KEYS[1]
local pending = KEYS[2]
local function add(id, member)
    redis.call('HSET', prefix .. 'sessions:' .. id, instance .. ':' .. member, instance)
    redis.call('ZREM', pending, id)
    if redis.call('SADD', online, id) == 1 then
        redis.call('PUBLISH', 'presence-channel', cjson.encode({userId=id, online=true}))
    end
end
local function defer(id)
    if redis.call('SISMEMBER', online, id) == 1 and not redis.call('ZSCORE', pending, id) then
        redis.call('ZADD', pending, now + grace, id)
    end
end
if operation == 'add' or operation == 'refresh' then
    redis.call('SET', prefix .. 'alive:' .. instance, '1', 'PX', ttl)
    if operation == 'add' then add(user, session) end
    if operation == 'refresh' then
        -- Reconcile our complete local snapshot, including disconnects during an outage.
        local current = {}
        for i=6,#ARGV,2 do current[ARGV[i] .. ':' .. instance .. ':' .. ARGV[i+1]] = true end
        for _,id in ipairs(redis.call('SMEMBERS', online)) do
            local key = prefix .. 'sessions:' .. id
            local sessions = redis.call('HGETALL', key)
            for i=1,#sessions,2 do
                if sessions[i+1] == instance and not current[id .. ':' .. sessions[i]] then
                    redis.call('HDEL', key, sessions[i])
                end
            end
            if redis.call('HLEN', key) == 0 then defer(id) end
        end
        for i=6,#ARGV,2 do add(ARGV[i], ARGV[i+1]) end
    end
elseif operation == 'remove' then
    local key = prefix .. 'sessions:' .. user
    if redis.call('HDEL', key, instance .. ':' .. session) == 1 and redis.call('HLEN', key) == 0 then
        defer(user)
    end
end
-- Sweep on reads as well as the periodic timer. Duplicate sweeps cannot publish twice.
if operation == 'sweep' or operation == 'read' then
    for _,id in ipairs(redis.call('SMEMBERS', online)) do
        local key = prefix .. 'sessions:' .. id
        local sessions = redis.call('HGETALL', key)
        for i=1,#sessions,2 do
            if redis.call('EXISTS', prefix .. 'alive:' .. sessions[i+1]) == 0 then
                redis.call('HDEL', key, sessions[i])
            end
        end
        if redis.call('HLEN', key) == 0 then
            defer(id)
            local deadline = tonumber(redis.call('ZSCORE', pending, id))
            if deadline and deadline <= now then
                redis.call('SREM', online, id)
                redis.call('ZREM', pending, id)
                redis.call('DEL', key)
                redis.call('PUBLISH', 'presence-channel', cjson.encode({userId=id, online=false}))
            end
        end
    end
end
return redis.call('SMEMBERS', online)
