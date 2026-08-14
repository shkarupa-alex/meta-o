# Backend support boundary

## Decision

Herdr, Orca and Paseo integrations use their documented public native surfaces
directly. Meta-O does not add an adapter layer, provider proxy, transcript reader
or backend state store. Each backend has a fixed orchestration entry and a fixed
standalone review entry because session semantics differ, while lifecycle and
review standards remain shared authored references.

## Business reason

The product exists to coordinate tools that already have sessions and control
planes, not to recreate them. A private transcript or inferred database can make
an integration appear reliable while tying it to implementation details the
backend does not promise. Separate entry skills keep native mechanics explicit;
shared contracts prevent review and lifecycle standards from drifting.

## Consequences

A backend must publicly expose complete settled responses, long-response
retrieval, questions, lifecycle state and whole-session diagnostics. A missing
capability blocks support instead of activating a fallback. Version changes are
diagnostic only; an observed break leads to a methodology improvement rather
than automatic version requalification.
