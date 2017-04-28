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

    if (this.chr.match(/\d/)) {
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
    } else if (this.chr.match(/[-<>,./{}[\]!#%*()+=]/)) {
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
    this.location = location
    this.name = 'SyntaxError'
  }
}

class Scope {
  constructor(start) {
    this.variables = []
    this.body = []
    this.start = start
  }

  generate() {
    return {
      type: 'Scope',
      variables: this.variables,
      body: this.body,
      start: this.start,
      end: this.end,
    }
  }

  add(node) {
    this.body.push(node)
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
    this.stack = [this.scope]
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
      body: this.scope.generate(),
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
    this.context.add({
      type: 'Text',
      text: this.source.substr(start, end),
      start, end,
    })
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

      switch (event.value) {
      case '{{': this.putValue();   break
      case '{%': this.statement();  break
      }
    }
  }

  putValue() {
    let start = this.source.location
    let value = this.expression(['|', '}}'])
    let filters = []

    while (this.peek().value === '|') {
      this.next()
      filters.push(this.expression(['|', '}}']))
    }

    let end = this.source.location
    this.expect('Symbol', '}}')

    this.context.add({
      type: "PutValue",
      value: value,
      filters: filters,
      start, end,
    })
  }

  statement() {
    this.context.start = this.source.location

    let id = this.identifier()
    switch (id.name) {
    case 'if':    break
    case 'for':   break
    case 'block': break
    case 'macro': break
    case 'filter':break
    case 'set':   break
    default:
      this.error(id, "Invalid statement")
    }
  }
}
