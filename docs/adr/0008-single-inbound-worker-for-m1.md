# ADR-0008: Use one STOMP inbound worker for M1
- Status: Accepted (owner choice in this chat)
- Date: 2026-10-26 · Deciders: @N-Tien-L

## Context
A held SUBSCRIBE followed by SEND is overtaken by the existing 4/16 inbound pool.
Native preserveReceiveOrder passed the latch test but needed an ERROR adapter and
still failed three real multi-session private-queue ITs with mutable-header errors.
Rejected prototype 1b27cca remains separately preserved.

## Decision
Use one inbound core/maximum worker, existing bounded FIFO queue100 and original
auth ERROR/close path for one backend and M1's small audience. Outbound pool unchanged.
Owner explicitly chose this tradeoff. No native ordering flag/adapter or dependency upgrade.

## Alternatives considered
| Option | Benefit | Cost |
| --- | --- | --- |
| One inbound worker | Simple order across handler tasks | All sessions share head-of-line blocking |
| Native ordered multi-worker | Independent session throughput | Proven private-queue regressions; needs separate compatibility work |
| Existing multi-worker | Throughput | SUBSCRIBE/SEND race remains |

## Consequences
A slow database/controller operation delays every inbound session. Queue saturation
may reject work and require reconnect/reconciliation. Keep existing rate limits;
revisit before increasing audience/backend count with the same ordering, rejection
and multi-session tests. This decision does not approve release/provider smoke.
