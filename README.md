# process-tree-lint

A command-line linter for `.ptree` files: a small text format for describing
a process supervision tree (a parent process and the children it spawns,
each with a command and a restart policy). The idea is to catch the mistakes
that normally only show up after something crashes in production — a
supervisor with no restart policy over a subtree of children, two processes
that were both accidentally named `worker`, an entry with no command to run
at all.

Nothing here talks to a real process tree (no `ps`, no `/proc`). It lints a
declarative description of one, the kind you'd hand-write for a custom init
process, a supervisord-style config, or documentation of how a container's
entrypoint fans out.

## the format

Indentation (two spaces per level) expresses parent/child relationships.
Attributes go in parens after the process name:

```
init (cmd="/sbin/init", restart=always)
  sshd (cmd="/usr/sbin/sshd -D", restart=always)
  app (restart=on-failure)
    worker (cmd="node worker.js")
    worker (cmd="node worker.js --replica")
  logger (detach=true)
```

Lines starting with `#` and blank lines are ignored. See
`examples/sample.ptree` for a file with a few problems baked in.

`detach=true` marks a process that forks away and is no longer directly
supervised; `reaper=true` marks a process that waits on its orphaned
descendants (the way a real init process does for PID 1). The linter checks
that every detached process has a reaper somewhere above it.

## rules (v0.1)

| rule                          | severity | meaning                                                   |
|--------------------------------|----------|------------------------------------------------------------|
| `missing-command`              | error    | a process has no `cmd` attribute                           |
| `duplicate-process-name`       | error    | the same name is used for two processes in the same file   |
| `no-restart-policy-with-children` | warning | a process with children has no `restart` attribute      |
| `detached-without-reaper`      | warning  | a `detach=true` process has no `reaper=true` ancestor       |
| `empty-tree`                   | error    | the file defines no processes at all                       |

## building and running

There are no third-party dependencies, so a plain TypeScript compile is all
that's needed:

```
tsc -p .
node dist/cli.js examples/sample.ptree
```

Human-readable output:

```
examples/sample.ptree:4: error: process "app" has no cmd attribute [missing-command]
examples/sample.ptree:6: error: process "worker" is already defined at line 5 [duplicate-process-name]
examples/sample.ptree:7: error: process "logger" has no cmd attribute [missing-command]
examples/sample.ptree:7: warning: process "logger" is detached but has no reaper in its ancestry; orphaned children will not be reaped [detached-without-reaper]
```

Machine-readable output, for feeding into CI or another tool:

```
node dist/cli.js --json examples/sample.ptree
```

```json
{
  "files": [
    {
      "file": "examples/sample.ptree",
      "parseErrors": [],
      "findings": [
        {
          "ruleId": "missing-command",
          "severity": "error",
          "line": 4,
          "processName": "app",
          "message": "process \"app\" has no cmd attribute"
        }
      ]
    }
  ]
}
```

The process exits with status `1` if any file has a parse error or an
error-severity finding, and `0` otherwise, so it can be dropped straight
into a CI step.

## status

Early skeleton: parser, five rules, and the two output modes. Rule set is
intentionally small for now — see the issues for what's planned next.

## license

MIT, see `LICENSE`.
