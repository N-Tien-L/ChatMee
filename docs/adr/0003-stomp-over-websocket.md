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
