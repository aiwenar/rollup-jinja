import est from './estree'

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
}
