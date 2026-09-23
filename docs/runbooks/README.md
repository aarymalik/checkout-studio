# Runbooks

One page per alert, answering a single question: it is 3am, this alert is firing, what do I do?

Every alert in [observability.md](../observability.md) links to a runbook here. An alert without one is not considered configured, per [release-process.md](../release-process.md).

## Index

Runbooks are written alongside the alerts they serve, in Phase 21, when monitoring is configured against a real production system. Writing them earlier would document a system that does not exist yet.

| Runbook                | Alert                                   | Phase |
| ---------------------- | --------------------------------------- | ----- |
| `rollback.md`          | Any release regression                  | 21    |
| `migration-failure.md` | Migration failed or timed out           | 21    |
| `payment-incident.md`  | Payment failure spike · amount mismatch | 21    |
| `webhook-backlog.md`   | Webhook lag above threshold             | 21    |
| `canary-failure.md`    | Canary comparison breached              | 21    |

## Shape

Each runbook follows the same structure, so that it can be followed under pressure:

```
Alert            what fired, and what it means
Impact           who is affected, and how badly
First response   the one action that reduces impact, before diagnosis
Diagnosis        ordered checks, most likely cause first
Resolution       how to fix it
Escalation       who to call, and when
Afterwards       what to record, and what to change so it cannot recur
```

**First response comes before diagnosis.** Restoring service is the priority; understanding is important, but it is not urgent in the same way.
