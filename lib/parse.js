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
    return this.code[this.column]
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
   * Get next event.
   */
  next() {
    while (this.chr.match(/\s/)) {
      this.nextchr()
    }

    let start = this.location
    let ret = null

    if (this.chr.match(/\d/)) {
      // TODO: parse number
    } else if (this.chr.match(/\w/)) {
      // TODO: parse identifier
    } else if (this.chr === '"' || this.chr === "'") {
      // TODO: parse string
    } else if (this.chr.match(/[-<>,./{}[\]!#%*()+=]/)) {
      // TODO: parse symbols
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
