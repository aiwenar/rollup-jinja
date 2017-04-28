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
})
