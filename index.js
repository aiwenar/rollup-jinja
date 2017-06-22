import { generate } from 'astring'
import { createFilter } from 'rollup-pluginutils';

import { SyntaxError } from './lib/parse'
import { compile } from './lib/index.js'

export default function jinja(options={}) {
  let filter = createFilter(options.include, options.exclude);

  return {
    name: 'Jinja',

    transform(source, id) {
      if (!filter(id)) return;

      let ast, code

      try {
        ast = compile(source)
        code = generate(ast)
      } catch (ex) {
        console.log(ex)
        if (!(ex instanceof SyntaxError)) {
          throw ex
        }
        this.error(ex.message, ex.location.start.offset)
      }

      // return { code, ast }
      return code
    },
  }
}
