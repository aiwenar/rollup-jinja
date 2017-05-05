import { Source, Parser, SyntaxError } from '../lib/parse'

describe('Source', () => {
  describe('symbols parser', () => {
    it('parses one-char symbols', () => {
      let ops = ['!','%','(',')','*','+','-','.','/','<','=','>','{','}']
      let src = new Source(ops.join(' '))

      for (let i = 0 ; i < ops.length ; ++i) {
        let ev = src.next()
        ev.should.deep.eq({
          type: 'Symbol',
          value: ops[i],
          start: { line: 1, column: 2*i, offset: 2*i },
          end:   { line: 1, column: 2*i+1, offset: 2*i+1 },
        })
      }
    })

    it('parses two-char symbols', () => {
      let ops = ['!=','%}','**','<=','==','>=','{%','{{','}}']
      let src = new Source(ops.join(' '))

      for (let i = 0 ; i < ops.length ; ++i) {
        let ev = src.next()
        ev.should.deep.eq({
          type: 'Symbol',
          value: ops[i],
          start: { line: 1, column: 3*i, offset: 3*i },
          end:   { line: 1, column: 3*i+2, offset: 3*i+2 },
        })
      }
    })
  })

  describe('number parser', () => {
    it('parses simple decimals', () => {
      new Source('4857').next().should.deep.eq({
        type: 'Number',
        value: 4857,
        start: { line: 1, column: 0, offset: 0 },
        end:   { line: 1, column: 4, offset: 4 },
      })
    })

    it('parses floating point with implicit fraction', () => {
      new Source('796.').next().should.deep.eq({
        type: 'Number',
        value: 796.,
        start: { line: 1, column: 0, offset: 0 },
        end:   { line: 1, column: 4, offset: 4 },
      })
    })

    it('parses floating point with explicit fraction', () => {
      new Source('53.87').next().should.deep.eq({
        type: 'Number',
        value: 53.87,
        start: { line: 1, column: 0, offset: 0 },
        end:   { line: 1, column: 5, offset: 5 },
      })
    })
  })

  describe('identifier parser', () => {
    it('parses identifiers', () => {
      new Source('identifier').next().should.deep.eq({
        type: 'Identifier',
        value: 'identifier',
        start: { line: 1, column: 0,  offset: 0 },
        end:   { line: 1, column: 10, offset: 10 },
      })
    })
  })

  describe('string parser', () => {
    it('parses " strings', () => {
      new Source('"a \'string\'"').next().should.deep.eq({
        type: 'String',
        start: { line: 1, column: 0,  offset: 0 },
        end:   { line: 1, column: 13, offset: 13 },
      })
    })

    it('parses \' strings', () => {
      new Source('\'a "string"\'').next().should.deep.eq({
        type: 'String',
        start: { line: 1, column: 0,  offset: 0 },
        end:   { line: 1, column: 13, offset: 13 },
      })
    })

    it('parses an unterminated string', () => {
      new Source('\'a "string"').next().should.deep.eq({
        type: 'String',
        start: { line: 1, column: 0,  offset: 0 },
        end:   { line: 1, column: 12, offset: 12 },
      })
    })
  })
})

const loc = (offset, line, column) => ({ offset, line, column })

const op = (op, offset, line, column) => ({
  type: 'Operator',
  value: op,
  start: loc(offset, line, column),
  end: loc(offset + op.length, line, column + op.length),
})

describe('Parser', () => {
  it('Generates proper empty AST', () => {
    new Parser(new Source('')).generate().should.deep.eq({
      type: 'Template',
      extends: null,
      blocks: [],
      macros: [],
      body: {
        type: 'Scope',
        variables: [],
        body: [],
        start: loc(0, 1, 0),
        end:   loc(0, 1, 0),
      },
      start: loc(0, 1, 0),
      end:   loc(0, 1, 0),
    })
  })

  it('Consumes text until a placeable', () => {
    let source = new Source('text {%')
    let parser = new Parser(source)
    ;(() => {
      parser.process()
    }).should.throw(SyntaxError)
    parser.scope.body.should.deep.eq([{
      type: 'Text',
      text: 'text ',
      start: loc(0, 1, 0),
      end:   loc(5, 1, 5),
    }])
    source.eos.should.eq(true)
  })

  describe("Expression parser", () => {
    it("reads variables", () => {
      let source = new Source('variable')
      let parser = new Parser(source)
      parser.expression([]).should.deep.eq({
        type: 'Variable',
        name: 'variable',
        start: loc(0, 1, 0),
        end:   loc(8, 1, 8),
      })
    })

    it("reads function calls", () => {
      let source = new Source('function()')
      let parser = new Parser(source)
      parser.expression([]).should.deep.eq({
        type: 'FunctionCall',
        function: {
          type: 'Identifier',
          value: 'function',
          start: loc(0, 1, 0),
          end:   loc(8, 1, 8),
        },
        args: [],
        start: loc(0, 1, 0),
        end:   loc(8, 1, 8),
      })
    })

    it("reads function call with argument", () => {
      let source = new Source('function(variable)')
      let parser = new Parser(source)
      parser.expression([]).should.deep.eq({
        type: 'FunctionCall',
        function: {
          type: 'Identifier',
          value: 'function',
          start: loc(0, 1, 0),
          end:   loc(8, 1, 8),
        },
        args: [{
          type: 'Variable',
          name: 'variable',
          start: loc(9, 1, 9),
          end:   loc(17, 1, 17),
        }],
        start: loc(0, 1, 0),
        end:   loc(17, 1, 17),
      })
    })

    it("reads binary expressions", () => {
      let source = new Source('v1 + v2')
      let parser = new Parser(source)
      parser.expression([]).should.deep.eq({
        type: 'BinOp',
        op: {
          type: 'Operator',
          value: '+',
          start: loc(3, 1, 3),
          end:   loc(4, 1, 4),
        },
        left: {
          type: 'Variable',
          name: 'v1',
          start: loc(0, 1, 0),
          end:   loc(2, 1, 2),
        },
        right: {
          type: 'Variable',
          name: 'v2',
          start: loc(5, 1, 5),
          end:   loc(7, 1, 7),
        },
        start: loc(0, 1, 0),
        end:   loc(7, 1, 7),
      })
    })

    it("respects operator precedence", () => {
      let source = new Source('v1 + v2 * v3 / (v4.v5 - v6)')
      let parser = new Parser(source)
      parser.expression([]).should.deep.eq({
        type: 'BinOp',
        op: op('+', 3, 1, 3),
        left: {
          type: 'Variable',
          name: 'v1',
          start: loc(0, 1, 0),
          end: loc(2, 1, 2),
        },
        right: {
          type: 'BinOp',
          op: op('/', 13, 1, 13),
          start: loc(10, 1, 10),
          left: {
            type: 'BinOp',
            op: op('*', 8, 1, 8),
            left: {
              type: 'Variable',
              name: 'v2',
              start: loc(5, 1, 5),
              end: loc(7, 1, 7),
            },
            right: {
              type: 'Variable',
              name: 'v3',
              start: loc(10, 1, 10),
              end: loc(12, 1, 12),
            },
            start: loc(5, 1, 5),
            end: loc(12, 1, 12),
          },
          right: {
            type: 'BinOp',
            op: op('-', 22, 1, 22),
            left: {
              type: 'BinOp',
              op: op('.', 18, 1, 18),
              left: {
                type: 'Variable',
                name: 'v4',
                start: loc(16, 1, 16),
                end: loc(18, 1, 18),
              },
              right: {
                type: 'Variable',
                name: 'v5',
                start: loc(19, 1, 19),
                end: loc(21, 1, 21),
              },
              start: loc(16, 1, 16),
              end: loc(21, 1, 21),
            },
            right: {
              type: 'Variable',
              name: 'v6',
              start: loc(24, 1, 24),
              end: loc(26, 1, 26),
            },
            start: loc(16, 1, 16),
            end: loc(26, 1, 26),
          },
          start: loc(5, 1, 5),
          end: loc(26, 1, 26),
        },
        start: loc(0, 1, 0),
        end: loc(26, 1, 26),
      })
    })
  })

  it("parses a placeable with no filters", () => {
    let source = new Source("{{ var + 2 }}")
    let parser = new Parser(source)
    parser.process()
    parser.scope.body.should.deep.eq([{
      type: 'PutValue',
      value: {
        type: 'BinOp',
        op: op('+', 7, 1, 7),
        left: {
          type: 'Variable',
          name: 'var',
          start: loc(3, 1, 3),
          end: loc(6, 1, 6),
        },
        right: {
          type: 'Number',
          value: 2,
          start: loc(9, 1, 9),
          end: loc(10, 1, 10),
        },
        start: loc(3, 1, 3),
        end: loc(10, 1, 10),
      },
      filters: [],
      start: loc(0, 1, 0),
      end: loc(13, 1, 13),
    }])
  })
})
