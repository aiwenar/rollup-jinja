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
  return est.ident(node.value, est.loc(node.start, node.end))
}

/**
 * Create a ESTree literal with source location
 *
 * @return {ESTree.Node}
 */
function lit(value, loc) {
  return est.literal(value, est.loc(loc.start, loc.end))
}

/**
 * Transforms Jinja AST to ESTree.
 *
 * @see #convert
 */
export default class Codegen {
  constructor() {
    this._inx = 0
    this.stack = []
    this.push()
  }

  get _top() {
    return this.stack[this.stack.length - 1]
  }

  get context() {
    return this._top.context
  }

  push() {
    this.stack.push({
      context: est.ident(`__j_ctx_${this._inx}`, est.loc(1, 0, 1, 0)),
    })
    this._inx += 1
  }

  pop() {
    this.stack.pop()
  }

  /**
   * Convert a Jinja AST node to an ESTree node.
   *
   * @param {Jinja.Node}   node  node to convert
   * @param {ESTree.Block} block some converters require blocks to place
   *                             generated code in (e.g. because they generate
   *                             more than one subtree)
   *
   * @return {EStree.Node}
   */
  convert(node, block=null) {
    if (!this[node.type]) {
      throw new Error(`Unknown node type: ${node.type}`)
    }
    return this[node.type](node, block)
  }

  /**
   * Convert template's root node.
   */
  Template(node) {
    let generate = est.generator('generate', 'context')
    this.convert(node.body, generate.with(est.ident('context')))

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

  /**
   * Convert macro definitions.
   */
  Macro(node) {
    let macro = est.generator(ident(node.name), ...node.args.map(a => this.convert(a)))

    this.push()
    this.convert(node.body, macro)
    this.pop()

    return macro
  }

  /**
   * Convert macro arguments.
   */
  Argument(node) {
    let pat = ident(node.name)
    if (node.default) {
      return est.assign(pat, lit(node.default.value, node.default))
    }
    return pat
  }

  /**
   * Convert a scope.
   */
  Scope(node, block) {
    block.let([[this.context, est.object({})]])
    block = block.with(this.context)

    for (let child of node.body) {
      this.convert(child, block)
    }
  }

  /**
   * Convert a text expression.
   */
  Text(node, block) {
    block.add(est.yield(lit(node.text, node)))
  }

  /**
   * Convert placeables.
   */
  PutValue(node, block) {
    let value = this.convert(node.value)
    for (let filter of node.filters.map(f => this.convert(f))) {
      // TODO: get filters from global state
      value = est.call(filter, value)
    }
    block.add(est.yield(value))
  }

  /**
   * Convert case statements.
   */
  CaseStatement(node, block) {
    for (let arm of node.arms) {
      let test = this.convert(arm.condition)
      block = block.if(test)

      for (let child of arm.body) {
        this.convert(child, block.then)
      }
    }
  }

  ForLoop(node, block) {
    // TODO: implement
  }

  CallBlock(node, block) {
    // TODO: implement
  }

  Assign(node, block) {
    // TODO: implement
  }

  /**
   * Convert block filters.
   */
  Filter(node, block) {
    let code = est.arrowgen(null)
    this.push()
    this.convert(node.body, block)
    this.pop()

    // TODO: get filter from global state
    let filter = this.convert(node.filter)
    let value = est.call(filter, est.call(code))

    block.add(est.yield(value, true))
  }

  /**
   * Convert variable access.
   */
  Variable(node) {
    return est.ident(node.name, est.loc(node.start, node.end))
  }

  /**
   * Convert member property access.
   */
  Member(node) {
    let object = this.convert(node.object)
    let property = this.convert(node.property)
    return est.member(object, property)
  }
}
