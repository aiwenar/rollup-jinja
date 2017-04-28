import { Source } from '../lib/parse'

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
})
