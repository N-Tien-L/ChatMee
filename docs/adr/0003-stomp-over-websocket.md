# ADR-0003: Use STOMP over WebSocket
- Status: Accepted
- Date: 2026-10-08 · Deciders: @N-Tien-L

## Context
We need real-time bidirectional communication, routed by room topics, with good Spring integration.

## Decision
Use Spring `@EnableWebSocketMessageBroker` + STOMP; the client will use `@stomp/stompjs`.

## Alternatives considered
| Option | Pros | Cons |
|---|---|---|
| Raw WebSockets | Lightweight | Must implement custom routing and protocol |
| SSE + REST | Simple unidirectional | Higher latency for sending messages |
| Socket.IO | Widespread ecosystem | Not standard in the Spring ecosystem |

## Consequences
- Positive: Built-in destinations, `@MessageMapping`, user destinations, and integration with Spring Security Messaging.
- Negative / technical debt: Cross-origin connection authentication is very difficult (see ADR-0004). We should reconsider using SockJS: modern browsers support WebSocket, and SockJS brings a dependency with a CVE (`websocket-driver`).

## Amendment 2026-10-09 (CM-053): SockJS dropped
- Decision: `/ws` is a plain WebSocket STOMP endpoint without `.withSockJS()`. The client uses `@stomp/stompjs` `brokerURL`. The handshake accepts only the `app.client.url` origin.
- Why:
  - `sockjs-client` pulled in a transitive dependency with a CVE (`websocket-driver`).
  - SockJS XHR fallback polls are cross-site HTTP requests without a session cookie, so the anonymous HTTP rate limit counted every poll and a fallback session would hit 429 within a minute.
  - Authentication uses the single-use ws-token at STOMP CONNECT (ADR-0004), so cookie-based SockJS transports are no longer needed.
- Consequence: there is no fallback for networks or proxies that block WebSockets; those clients cannot connect in real time. The deployed `NEXT_PUBLIC_WS_URL` stays valid because the client maps `http(s)://` to `ws(s)://`.
