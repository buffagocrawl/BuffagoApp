# Cayenne architecture

Serrano requests and decides. Cayenne validates a request, creates an isolated run artifact directory, tracks a lock,
records environment/tool evidence, executes only configured adapters, classifies missing execution as inconclusive,
and emits a schema-validated result. A result with failed required journeys or missing evidence cannot be passed.

