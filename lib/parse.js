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
      // TODO: parse identifier
    } else if (this.chr === '"' || this.chr === "'") {
      // TODO: parse string
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
    for (;;) {
      yield this.next()
    }
  }
}
