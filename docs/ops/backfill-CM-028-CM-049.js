// One-off production backfill for CM-028 (memberCount) and CM-049 (DM memberKey).
// Run with mongosh against the ChatMee database. Idempotent: safe to run more than once.
//
//   mongosh "<connection string>" --file backfill-CM-028-CM-049.js              (dry run, writes nothing)
//   mongosh "<connection string>" --file backfill-CM-028-CM-049.js --eval "var APPLY=true"   (writes)
//
// Take an Atlas snapshot before running with APPLY=true.

const apply = typeof APPLY !== "undefined" && APPLY === true;
print(apply ? "MODE: APPLY (writing)" : "MODE: DRY RUN (nothing is written)");
print("database: " + db.getName());

// ---------------------------------------------------------------- CM-028: memberCount
// memberCount must equal the number of participants rows of an active room.
print("\n== CM-028 memberCount ==");
const counts = {};
db.participants.aggregate([{ $group: { _id: "$chatRoomId", n: { $sum: 1 } } }])
  .forEach(g => { counts[g._id] = g.n; });

let countFixed = 0, countOk = 0, countNoRows = [];
db.chat_rooms.find({ isActive: true }, { memberCount: 1, name: 1 }).forEach(room => {
  const id = room._id.toString();
  const real = counts[id] || 0;
  const stored = room.memberCount || 0;
  if (real === 0) {
    countNoRows.push(id + " (" + (room.name || "no name") + ")");
  }
  if (stored === real) { countOk++; return; }
  print("  room " + id + ": memberCount " + stored + " -> " + real);
  countFixed++;
  if (apply) db.chat_rooms.updateOne({ _id: room._id }, { $set: { memberCount: real } });
});
print("already correct: " + countOk + ", to fix: " + countFixed);
if (countNoRows.length) {
  print("WARNING active rooms with NO participants rows (legacy data? check manually, not changed to a real count):");
  countNoRows.forEach(r => print("  " + r));
}

// ---------------------------------------------------------------- CM-049: DM memberKey
// Active DIRECT_MESSAGE rooms need memberKey = sorted "userA:userB". One active DM per pair:
// when a pair has duplicates, the most recently active room gets the key and the others stay keyless.
print("\n== CM-049 memberKey ==");
const byKey = {};
const skipped = [];
db.chat_rooms.find({ isActive: true, type: "DIRECT_MESSAGE", memberKey: { $exists: false } },
                   { lastActivity: 1, createdAt: 1 }).forEach(room => {
  const id = room._id.toString();
  const users = db.participants.find({ chatRoomId: id }, { userId: 1 }).toArray().map(p => p.userId);
  if (users.length !== 2 || users[0] === users[1]) {
    skipped.push(id + " (participants: " + users.length + ")");
    return;
  }
  users.sort();                       // same order as Java String.compareTo for ASCII ids
  const key = users[0] + ":" + users[1];
  (byKey[key] = byKey[key] || []).push(room);
});

let keySet = 0, keyDuplicates = 0;
Object.keys(byKey).forEach(key => {
  const rooms = byKey[key].sort((a, b) =>
    (b.lastActivity || b.createdAt || 0) - (a.lastActivity || a.createdAt || 0));
  const winner = rooms[0];
  print("  key " + key + " -> room " + winner._id.toString());
  keySet++;
  if (apply) db.chat_rooms.updateOne({ _id: winner._id }, { $set: { memberKey: key } });
  rooms.slice(1).forEach(loser => {
    keyDuplicates++;
    print("    duplicate DM left without key: " + loser._id.toString() + " (still active, decide later)");
  });
});
print("memberKey to set: " + keySet + ", duplicates left alone: " + keyDuplicates);
if (skipped.length) {
  print("WARNING DM rooms skipped (not exactly 2 distinct participants):");
  skipped.forEach(r => print("  " + r));
}

print("\nDone. " + (apply ? "Changes written." : "Dry run only. Re-run with --eval \"var APPLY=true\" to write."));
