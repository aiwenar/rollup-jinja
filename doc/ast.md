## Node objects

All node objects used in AST implement the following interface:

```js
interface Node {
  type: String;
  start: Location;
  end: Location;
}
```

Where `type` is a string representing the nodes type, and `start` and `end` 
describe position in the source code, pointing to, respectively, 
first character before the node (`start`) and first character 
after the node (`end`). Both properties implement following interface:

```js
interface Location {
  offset: number; // >= 0
  line: number; // >= 1
  column: number; // >= 0
}
```

Where `offset` is a raw byte offset from the beginning of the source code.
`line` and `column` are provided for convenience of generating ESTree AST.

## Identifier

```js
interface Identifier <: Node, Pattern {
  type: "Identifier";
  name: String;
}
```

## Template

```js
interface Template <: Node {
  type: "Template";
  extends: Identifier | null;
  blocks: [Block];
  macros: [Macro];
  body: Scope;
}
```

A complete template source tree.

Note that block sources are stored at the AST root.

## Scope

```js
interface Scope <: Node {
  type: "Scope";
  variables: [Identifier];
  body: [Placeable];
}
```

A block of `Placeable`s with a set of variables. 

## Macro

```js
interface Macro <: Node {
  type: "Macro";
  args: [Identifier];
  kwargs: [KeywordArgument];
  body: Scope;
}
```

```js
interface KeywordArgument <: Node {
  type: "KeywordArgument";
  name: Identifier;
  initial: Expression;
}
```

## Block

```js
interface Block <: Node {
  type: "Block";
  name: String;
}
```

A place in the template which can be delegated to be rendered by a descendant
template.

## Placeables

```js
interface Placeable <: Node {
}
```

Nodes which evaluate to text or control this evaluation.

```js
interface Statement <: Placeable {
}
```

Any statement which does not produce output.

```js
interface PutValue <: Placeable {
}
```

Any statement which does produce output.

```js
interface Text <: Statement {
  type: "Text";
  text: String;
}
```

A raw text.

### If statement

```js
interface IfStmt <: Statement {
  type: "IfStmt";
  predicate: Expression;
  body: [Placeable];
  alternative: IfStmt | [Placeable] | null;
}
```

Note that if statements don't introduce a new scope.

### For loop

```js
interface ForLoop <: Statement {
  type: "ForLoop";
  pattern: Pattern;
  iterable: Expression;
  filter: Expression | null;
  body: Scope;
  alternative: Scope | null;
}
```

### Block

```js
interface RenderBlock <: Statement {
  type: "RenderBlock";
  name: Identifier;
  body: Scope;
}
```

Render contents of a block. `name` must reference a block listed in the `block`
property of `Template`.

### Macro invocation

```js
interface CallMacro <: Statement {
  type: "CallMacro";
  name: Identifier;
  arguments: [Expression];
  body: Scope;
}
```

### Block filter

```js
interface BlockFilter <: Statement {
  type: "BlockFilter";
  filter: Identifier;
  body: Scope;
}
```

### Variable assignment

```js
interface Assignment <: Statement {
  type: "Assignment";
  pattern: Pattern;
  value: Expression;
}
```

The variable will be set within the innermost scope only.
