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
  ',',  0,
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
    return this.code[this.offset] || ''
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
  next(strings=false) {
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
    } else if (strings && (this.chr === '"' || this.chr === "'")) {
      let terminator = this.chr
      this.nextchr()

      while (!this.eos && this.chr !== terminator) {
        if (this.chr === '\\') {
          this.nextchr()
        }
        this.nextchr()
      }
      this.nextchr()

      ret = { type: 'String' }
    } else if (this.chr.match(/[-<>,./{}[\]!#%*()+=,|]/)) {
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

  generate(end, body) {
    return {
      type: 'Scope',
      variables: this.variables,
      start: this.start,
      body, end,
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
  case 'elif':  parser.elif(id); break
  default:      elseStatement(parser, id)
  }
}

function forStatement(parser, id) {
  switch (id.value) {
  case 'endfor':parser.endfor(id);  break;
  case 'else':  parser.elsefor(id); break;
  default:      parser.error(id, "Invalid statement")
  }
}

function forElseStatement(parser, id) {
  switch (id.value) {
  case 'endfor':parser.endforelse(id);  break;
  default:      parser.error(id, "Invalid statement")
  }
}

function macroStatement(parser, id) {
  switch (id.value) {
  case 'endmacro':  parser.endmacro(id);  break
  default:          parser.error(id, "Invalid statement")
  }
}

function callStatement(parser, id) {
  switch (id.value) {
  case 'endcall':   parser.endcall(id);  break
  default:          parser.error(id, "Invalid statement")
  }
}

function filterStatement(parser, id) {
  switch (id.value) {
  case 'endfilter': parser.endfilter(id);  break
  default:          parser.error(id, "Invalid statement")
  }
}

function blockStatement(parser, id) {
  switch (id.value) {
  case 'endblock':  parser.endblock(id);  break
  default:          parser.error(id, "Invalid statement")
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
    this.stack = [{
      scope: new Scope(source.location),
      body: [],
      statement(parser, id) {
        parser.error(id, "Invalid statement")
      }
    }]
    this.events = []
  }

  get context() {
    return this.stack[this.stack.length - 1]
  }

  generate() {
    let { scope, body } = this.stack.pop()
    if (this.stack.length > 0) {
      this.error(scope, "Unclosed block")
    }

    return {
      type: 'Template',
      extends: null,
      blocks: Object.values(this.blocks),
      macros: Object.values(this.macros),
      body: scope.generate(this.source.location, body),
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
    case 'Identifier':
      if (ev.value !== data) {
        this.error(ev, `Expected ${data}`)
      }
      break
    }
  }

  check(type, data) {
    let ev = this.peek()
    if (ev.type !== type) {
      return false
    }

    switch (type) {
    case 'Symbol':
    case 'Identifier':
      if (ev.value !== data) {
        return false
      }
      break
    }

    return true
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

  next(strings) {
    if (this.events.length > 0) {
      return this.events.pop(strings)
    }
    return this.source.next(strings)
  }

  peek(strings) {
    let ev = this.next(strings)
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

    let eos = this.next()
    if (eos.start.offset - start.offset > 0) {
      this.putText(start, eos.start)
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
    case 'for':   this.for(id);break
    case 'block': this.block(id); break
    case 'macro': this.macro(id); break
    case 'call':  this.call(id);  break
    case 'filter':this.filter(id);break
    case 'set':   this.set(id);   break
    default:
      this.context.statement(this, id)
    }

    this.expect('Symbol', '%}')
  }

  expression(terminators, kwTerminators=[]) {
    let yard = new Yard()

    this.peek(true)
    while (!this.eos) {
      let tok = this.peek(true)
      if (tok.type === 'Symbol' && terminators.indexOf(tok.value) !== -1) {
        break
      }
      if (tok.type === 'Identifier' && kwTerminators.indexOf(tok.value) !== -1) {
        break
      }
      yard.process(this.next(true), this.peek(true))
    }

    return yard.finish()
  }

  pattern() {
    let start = this.peek().start
    let names = []
    let end = null

    for (;;) {
      let name = this.identifier()
      names.push({
        type: 'Variable',
        name: name.value,
        start: name.start,
        end: name.end,
      })
      end = name.end

      if (!this.check('Symbol', ',')) {
        break
      }
      this.next()
    }

    if (names.length > 1) {
      return {
        type: 'Unpack',
        names, start, end,
      }
    } else {
      return names[0]
    }
  }

  literal() {
    let tok = this.next()
    switch (tok.type) {
    case 'Number':
      return tok

    default:
      this.error(tok, "Expected a literal value")
    }
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

  elif(id) {
    let { arms, arm, start } = this.stack.pop()
    arm.end = this.source.location
    arms.push(arm)

    let condition = this.expression(['%}'])
    let body = []
    this.stack.push({
      scope: this.context.scope,
      statement: ifStatement,
      arm: {
        type: 'Arm',
        condition, start, body,
      },
      arms, body,
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

  for(id) {
    let pattern = this.pattern()
    this.expect('Identifier', 'in')
    let iterable = this.expression(['%}'], ['if'])

    let filter = null
    if (this.check('Identifier', 'if')) {
      this.next()
      filter = this.expression(['%}'])
    }

    this.stack.push({
      scope: new Scope(this.source.location),
      statement: forStatement,
      template: {
        type: 'ForLoop',
        alternative: null,
        start: this.context.start,
        pattern, iterable, filter,
      },
      body: [],
    })
  }

  elsefor(id) {
    let { scope, template, body, start } = this.stack.pop()
    template.body = scope.generate(start, body)

    this.stack.push({
      scope: this.context.scope,
      statement: forElseStatement,
      body: [],
      template,
    })
  }

  endforelse(id) {
    let { template, body } = this.stack.pop()
    template.alternative = body
    template.end = this.source.location
    this.context.body.push(template)
  }

  endfor(id) {
    let { scope, template, body, start } = this.stack.pop()
    template.body = scope.generate(start, body)
    template.end = this.source.location
    this.context.body.push(template)
  }

  macro(id) {
    let name = this.identifier()

    let args = []
    this.expect('Symbol', '(')
    while (!this.eos && !this.check('Symbol', ')')) {
      let arg = this.identifier()
      let default_ = null

      if (this.check('Symbol', '=')) {
        this.next()
        default_ = this.literal()
      }

      args.push({
        type: 'Argument',
        name: arg,
        start: arg.start,
        end: this.peek().start,
        default: default_,
      })

      if (this.check('Symbol', ')')) {
        break
      }
      this.expect('Symbol', ',')
    }
    this.expect('Symbol', ')')

    this.peek()
    this.stack.push({
      scope: new Scope(this.source.location),
      template: {
        type: 'Macro',
        start: this.context.start,
        name, args,
      },
      body: [],
      statement: macroStatement,
    })
  }

  endmacro(id) {
    let { scope, template, body, start } = this.stack.pop()
    template.body = scope.generate(start, body)
    template.end = this.source.location
    this.macros[template.name.value] = template
  }

  call(id) {
    let name = this.identifier()

    let args = []
    this.expect('Symbol', '(')
    while (!this.eos) {
      args.push(this.expression([',', ')']))

      if (this.check('Symbol', ')')) {
        break
      }
      this.expect('Symbol', ',')
    }
    this.expect('Symbol', ')')

    this.peek()
    this.stack.push({
      scope: new Scope(this.source.location),
      template: {
        type: 'MacroCall',
        macro: name,
        start: this.context.start,
        args,
      },
      body: [],
      statement: callStatement,
    })
  }

  endcall(id) {
    let { scope, template, body, start } = this.stack.pop()
    template.body = scope.generate(start, body)
    template.end = this.source.location
    this.context.body.push(template)
  }

  filter(id) {
    let filter = this.expression(['%}'])
    this.stack.push({
      scope: new Scope(this.source.location),
      template: {
        type: 'Filter',
        start: this.context.start,
        filter,
      },
      body: [],
      statement: filterStatement,
    })
  }

  endfilter(id) {
    let { scope, template, body, start } = this.stack.pop()
    template.body = scope.generate(start, body)
    template.end = this.source.location
    this.context.body.push(template)
  }

  set(id) {
    let pattern = this.pattern()
    this.expect('Symbol', '=')
    let value = this.expression(['%}'])
    this.context.body.push({
      type: 'Assign',
      start: this.context.start,
      end: this.source.location,
      pattern, value,
    })
  }

  block(id) {
    let name = this.identifier()
    this.peek()
    this.stack.push({
      scope: new Scope(this.source.location),
      body: [],
      template: {
        start: this.context.start,
        name,
      },
      statement: blockStatement,
    })
  }

  endblock(id) {
    let { scope, body, template, start } = this.stack.pop()
    this.peek()
    template.end = this.source.location

    this.context.body.push(Object.assign({
      type: 'CallBlock',
    }, template))

    template.type = 'Block'
    template.body = scope.generate(start, body)
    this.blocks[template.name.value] = template
  }
}

const CallOp = Symbol('Call operator')

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
  '|':  { precedence:  50, associativity: 'left' },
  [CallOp]: { precedence: 550, associativity: 'left' },
}

class Yard {
  constructor() {
    this.stack = []
    this.out = []
    this._state = null
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
      throw new Error('No more values')
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
    if (op.type === 'Symbol' && op.value === '.') {
      let property = this.back()
      let object = this.back()
      this.write({
        type: 'Member',
        start: object.start,
        end: property.end,
        property, object,
      })
    } else if (op.type === 'Symbol' && op.value === '|') {
      let filter = this.back()
      let value = this.back()
      this.write({
        type: 'Filter',
        start: value.start,
        end: filter.end,
        filter, value,
      })
    } else if (op.type === 'Symbol') {
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
    } else if (op.type === 'Call') {
      let args = []
      for (;;) {
        let top = this.back()
        if (top.type === 'ArgListGuard') break;
        args.push(top)
      }
      let fun = this.back()
      this.write({
        type: 'FunctionCall',
        function: fun,
        args: args.reverse(),
        start: fun.start,
        end: this._end,
      })
    } else {
      throw new SyntaxError(op, `${op.type} should not be on the operator stack`)
    }
  }

  writeTerminated(terminator) {
    while (this.stack.length > 0) {
      let top = this.pop()
      if (top.value === terminator) return top;

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
      this.write({
        type: 'Variable',
        name: tok.value,
        start: tok.start,
        end: tok.end,
      })
      this._state = 'maybe-call'
      break

    case 'Number':
      this.write(tok)
      this._state = 'number'
      break

    case 'String':
      this.write(tok)
      this._state = 'string'
      break

    case 'Symbol':
      switch (tok.value) {
      case '(':
        if (this._state === 'maybe-call') {
          this.writeOperator({
            type: 'Call',
            value: CallOp,
          })
          this.write({ type: 'ArgListGuard' })
        }
        this.push(tok)
        this._state = null
        break

      case ')':
        this._end = tok.end
        this.writeTerminated('(')
        this._state = 'maybe-call'
        break

      case ',':
        this.push(this.writeTerminated('('))
        this._state = null
        break

      default:
        this.writeOperator(tok)
        this._state = null
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
