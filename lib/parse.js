const SYMBOLS = [
  '!',  0,
  '!=', 1,
  '%',  0,
  '%}', 1,
  '(',  0,
  ')',  0,
  '*',  0,
  '**', 1,
  '+',  0,
  '-',  0,
  '.',  0,
  '/',  0,
  '<',  0,
  '<=', 1,
  '=',  0,
  '==', 1,
  '>',  0,
  '>=', 1,
  '{',  0,
  '{%', 1,
  '{{', 1,
  '|',  0,
  '}',  0,
  '}}', 1,
]

export class Source {
  constructor(code) {
    this.code = code
    this.offset = 0
    this.line = 1
    this.column = 0
  }

  /**
   * True if the source stream has been exhausted.
   */
  get eos() {
    return this.offset >= this.code.length
  }

  /**
   * Current character.
   */
  get chr() {
    return this.code[this.column] || ''
  }

  /**
   * Current source location.
   */
  get location() {
    return {
      offset: this.offset,
      line: this.line,
      column: this.column,
    }
  }

  /**
   * Advance internal state by one character.
   */
  nextchr() {
    this.offset += 1
    this.column += 1

    if (this.chr === '\n') {
      this.line += 1;
      this.column = 0;
    }
  }

  /**
   * Get code range between two source locations.
   */
  substr(start, end) {
    return this.code.substr(start.offset, end.offset - start.offset)
  }

  /**
   * Get next event.
   */
  next() {
    while (this.chr.match(/\s/)) {
      this.nextchr()
    }

    let start = this.location
    let ret = null

    if (this.eos) {
      ret = { type: 'EndOfStream' }
    } if (this.chr.match(/\d/)) {
      while (this.chr.match(/\d/)) {
        this.nextchr()
      }

      if (this.chr === '.') {
        this.nextchr()
        while (this.chr.match(/\d/)) {
          this.nextchr()
        }
      }

      let end = this.location

      ret = {
        type: 'Number',
        value: Number(this.substr(start, end)),
      }
    } else if (this.chr.match(/\w/)) {
      while (this.chr.match(/\w/)) {
        this.nextchr()
      }

      let end = this.location

      ret = {
        type: 'Identifier',
        value: this.substr(start, end),
      }
    } else if (this.chr === '"' || this.chr === "'") {
      let terminator = this.chr
      this.nextchr()

      while (!this.eos && this.chr !== this.terminator) {
        if (this.chr === '\\') {
          this.nextchr()
        }
        this.nextchr()
      }
      this.nextchr()

      ret = { type: 'String' }
    } else if (this.chr.match(/[-<>,./{}[\]!#%*()+=|]/)) {
      let sym = null
      let depth = 0
      for (let i = 0 ; i < SYMBOLS.length && depth <= SYMBOLS[i+1] ; i += 2) {
        if (depth !== SYMBOLS[i+1]) {
          continue
        } else if (this.chr === SYMBOLS[i][depth]) {
          depth += 1
          this.nextchr()
        }

        if (depth === SYMBOLS[i].length) {
          sym = SYMBOLS[i]
        }
      }

      if (sym) {
        ret = {
          type: 'Symbol',
          value: sym,
        }
      }
    }

    if (!ret) {
      ret = {
        type: 'Character',
        value: this.chr,
      }
      this.nextchr()
    }

    ret.start = start,
    ret.end = this.location
    return ret
  }

  *events() {
    while (!this.eos) {
      yield this.next()
    }
  }
}

export class SyntaxError extends Error {
  constructor(location, ...message) {
    super(...message)
    this.location = {
      start: location.start,
      end: location.end,
    }
    this.name = 'SyntaxError'
    this.message = `(${location.start.line}:${location.start.column}) ${this.message}`
  }
}

class Scope {
  constructor(start) {
    this.variables = []
    this.start = start
  }

  generate(body) {
    return {
      type: 'Scope',
      variables: this.variables,
      start: this.start,
      end: this.end,
      body,
    }
  }
}

function elseStatement(parser, id) {
  switch (id.value) {
  case 'endif': parser.endif(id); break
  default:      parser.error(id, "Invalid statement")
  }
}

function ifStatement(parser, id) {
  switch (id.value) {
  case 'else':  parser.else(id); break
  default:      elseStatement(parser, id)
  }
}

export class Parser {
  constructor(source) {
    this.source = source
    this._start = source.location
    this.blocks = {}
    this.macros = {}
    this.variables = {}
    this.extends = null
    this.scope = new Scope(source.location)
    this.stack = [{
      scope: this.scope,
      body: [],
      statement(parser, id) {
        this.error(id, "Invalid statement")
      }
    }]
    this.events = []
  }

  get context() {
    return this.stack[this.stack.length - 1]
  }

  generate() {
    this.scope.end = this.source.location
    return {
      type: 'Template',
      extends: null,
      blocks: Object.values(this.blocks),
      macros: Object.values(this.macros),
      body: this.scope.generate(this.stack[0].body),
      start: this._start,
      end: this.source.location
    }
  }

  error(location, ...message) {
    throw new SyntaxError(location, ...message)
  }

  expect(type, data) {
    let ev = this.next()
    if (ev.type !== type) {
      this.error(ev, `Expected \`${type}\` but got \`${ev.type}\``)
    }

    switch (type) {
    case 'Symbol':
      if (ev.value !== data) {
        this.error(ev, `Expected ${data}`)
      }
      break
    }
  }

  putText(start, end) {
    this.context.body.push({
      type: 'Text',
      text: this.source.substr(start, end),
      start, end,
    })
  }

  get eos() {
    let tok = this.next()
    if (tok.type === 'EndOfStream') {
      return true
    } else {
      this.events.push(tok)
      return false
    }
  }

  next() {
    if (this.events.length > 0) {
      return this.events.pop()
    }
    return this.source.next()
  }

  peek() {
    let ev = this.next()
    this.events.push(ev)
    return ev
  }

  putback(event) {
    this.events.push(event)
  }

  identifier() {
    let event = this.next()
    if (event.type !== 'Identifier') {
      this.error(event, "Expected identifier")
    }
    return event
  }

  process() {
    let start = this.source.location

    for (let event of this.source.events()) {
      if (event.type !== 'Symbol' || (event.value !== '{%' && event.value !== '{{')) {
        continue
      }

      if (event.start.offset - start.offset > 0) {
        this.putText(start, event.start)
      }

      this.context.start = event.start
      switch (event.value) {
      case '{{': this.putValue();   break
      case '{%': this.statement();  break
      }
      start = this.source.location
    }
  }

  putValue() {
    let value = this.expression(['|', '}}'])
    let filters = []

    while (this.peek().value === '|') {
      this.next()
      filters.push(this.expression(['|', '}}']))
    }

    let end = this.source.location
    this.expect('Symbol', '}}')

    this.context.body.push({
      type: "PutValue",
      value: value,
      filters: filters,
      start: this.context.start,
      end,
    })
  }

  statement() {
    let id = this.identifier()
    switch (id.value) {
    case 'if':    this.if(id); break
    case 'for':   break
    case 'block': break
    case 'macro': break
    case 'filter':break
    case 'set':   break
    default:
      this.context.statement(this, id)
    }

    this.expect('Symbol', '%}')
  }

  expression(terminators) {
    let yard = new Yard()

    while (!this.eos) {
      let tok = this.peek()
      if (tok.type === 'Symbol' && terminators.indexOf(tok.value) !== -1) {
        break
      }
      yard.process(this.next(), this.peek())
    }

    return yard.finish()
  }

  if(id) {
    let condition = this.expression(['%}'])
    let body = []
    this.stack.push({
      scope: this.context.scope,
      arms: [],
      arm: {
        type: 'Arm',
        start: this.context.start,
        condition, body,
      },
      statement: ifStatement,
      body,
    })
  }

  endif(id) {
    let { arms, arm } = this.stack.pop()
    arm.end = this.source.location
    arms.push(arm)

    this.context.body.push({
      type: 'CaseStatement',
      arms,
      start: this.context.start,
      end: this.source.location,
    })
  }

  else(id) {
    let { arms, arm, start } = this.stack.pop()
    arm.end = this.source.location
    arms.push(arm)

    let body = []
    this.stack.push({
      scope: this.context.scope,
      statement: elseStatement,
      arm: {
        type: 'Arm',
        condition: {
          type: 'Boolean',
          value: true,
          start: start,
          end: start,
        },
        start, body,
      },
      arms, body
    })
  }
}

const OPERATORS = {
  '!=': { precedence: 200, associativity: 'left' },
  '%':  { precedence: 400, associativity: 'left' },
  '*':  { precedence: 400, associativity: 'left' },
  '**': { precedence: 500, associativity: 'right' },
  '+':  { precedence: 300, associativity: 'left' },
  '-':  { precedence: 300, associativity: 'left' },
  '.':  { precedence: 600, associativity: 'left' },
  '/':  { precedence: 400, associativity: 'left' },
  '<':  { precedence: 200, associativity: 'left' },
  '<=': { precedence: 200, associativity: 'left' },
  '=':  { precedence: 100, associativity: 'left' },
  '==': { precedence: 200, associativity: 'left' },
  '>':  { precedence: 200, associativity: 'left' },
  '>=': { precedence: 200, associativity: 'left' },
  '(':  { precedence: 0,   associativity: 'left' },
}

class Yard {
  constructor() {
    this.stack = []
    this.out = []
  }

  push(op) {
    this.stack.push(op)
  }

  pop() {
    return this.stack.pop()
  }

  back() {
    let back = this.out.pop()
    if (!back) {
      throw new SyntaxError(null, 'No more values')
    }
    return back
  }

  operator(op) {
    let v = OPERATORS[op.value]
    if (!v) {
      throw new SyntaxError(op, `${op.value} is not an operator`)
    }
    return v
  }

  write(sym) {
    this.out.push(sym)
  }

  writePop(op) {
    if (op.type === 'Symbol') {
      let right = this.back()
      let left = this.back()
      this.write({
        type: 'BinOp',
        op: {
          type: 'Operator',
          value: op.value,
          start: op.start,
          end: op.end,
        },
        start: left.start,
        end: right.end,
        left, right,
      })
    } else if (op.type === 'Function') {
      let args = []
      let end = op.name.end
      for (;;) {
        let top = this.back()
        if (top.type === 'ArgListGuard') break;
        args.push(top)
        end = top.end
      }
      this.write({
        type: 'FunctionCall',
        function: op.name,
        args: args,
        start: op.name.start,
        end,
      })
    } else {
      throw new SyntaxError(op, `${op.type} should not be on the operator stack`)
    }
  }

  writeTerminated(terminator) {
    while (this.stack.length > 0) {
      let top = this.pop()
      if (top.value === terminator) break;

      this.writePop(top)
    }
  }

  writeOperator(op) {
    let opi = this.operator(op)

    while (this.stack.length > 0) {
      let top = this.pop()
      let topi = this.operator(top)

      if ((opi.associativity === 'left' && opi.precedence <= topi.precedence)
      || (opi.associativity !== 'left' && opi.precedence < topi.precedence)) {
        this.writePop(top)
      } else {
        this.push(top)
        break
      }
    }

    this.push(op)
  }

  process(tok, peek) {
    switch (tok.type) {
    case 'Identifier':
      if (peek.type === 'Symbol' && peek.value === '(') {
        // Function token
        this.write({ type: 'ArgListGuard' })
        this.push({
          type: 'Function',
          name: tok,
        })
      } else {
        // Identifier
        this.write({
          type: 'Variable',
          name: tok.value,
          start: tok.start,
          end: tok.end,
        })
      }
      break

    case 'Number':
      this.write(tok)
      break

    case 'Symbol':
      switch (tok.value) {
      case '(':
        this.push(tok)
        break

      case ')':
        this.writeTerminated('(')
        break

      case ',':
        this.writeSeparated(',')
        break

      default:
        this.writeOperator(tok)
        break
      }
      break

    default:
      throw new SyntaxError(tok, `unexpected ${tok.type}`)
    }
  }

  finish() {
    while (this.stack.length > 0) {
      let top = this.pop()
      if (top.type === 'Symbol' && top.value === '(') {
        throw new SyntaxError(top, 'Mismatched parenthesis')
      }
      this.writePop(top)
    }

    if (this.out.length > 1) {
      throw new SyntaxError(this.out[1], 'Expression produced more than one value')
    }
    return this.out[0]
  }
}
