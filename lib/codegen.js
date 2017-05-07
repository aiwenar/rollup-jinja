import est from './estree'

/**
 * Convert a Jinja Identifier into an ESTree Identifier.
 *
 * @param {Jinja.Node} node
 *
 * @return {ESTree.Node}
 */
function ident(node) {
  if (node.type !== 'Identifier') {
    throw new Error('Not an Identifier')
  }
  console.log('IDENT', node)
  // return est.ident(node.value, est.loc(null, node.start, node.end))
  return est.ident(node.value)
}

/**
 * Transforms Jinja AST to ESTree.
 *
 * @see #convert
 */
export default class Codegen {
  /**
   * Convert a Jinja AST node to an ESTree node.
   *
   * @param {Jinja.Node} node  node to convert
   *
   * @return {EStree.Node}
   */
  convert(node) {
    if (!this[node.type]) {
      throw new Error(`Unknown node type: ${node.type}`)
    }
    return this[node.type](node)
  }

  /**
   * Convert template's root node.
   */
  Template(node) {
    let generate = est.function('generate', 'context')
    generate.add(this.convert(node.body))

    return est.object({
      blocks: est.object(node.blocks.map(block => [
        ident(block.name), this.convert(block)
      ])),
      macros: est.object(node.macros.map(macro => [
        ident(macro.name), this.convert(macro)
      ])),
      generate,
    })
  }

  Block(node) {
    // TODO: implement
    return est.literal(null)
  }

  Macro(node) {
    // TODO: implement
    return est.literal(null)
  }

  Scope(node) {
    // TODO: implement
    return est.empty()
  }
}
