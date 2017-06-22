import translate from './codegen'
import est from './estree'
import { Source, Parser } from './parse'

export function compile(source, name) {
  source = new Source(source, name)

  let parser = new Parser(source)
  parser.process()

  let ast = translate(parser.generate())

  let program = est.module()
  program.add(est.exportDefault(ast))

  return program
}
