import est from './estree'

export default function translate(node) {
  return new Codegen().convert(node)
}

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
 * Convert Jinja AST location into an ESTree location.
 *
 * @param {Jinja.Node} node
 *
 * @return {ESTree.Location}
 */
function loc(node) {
  return est.loc(node.start, node.end)
}

/**
 * Create a ESTree literal with source location
 *
 * @return {ESTree.Node}
 */
function lit(value, loc) {
  return est.literal(value, est.loc(loc.start, loc.end))
}

function* zip(...args) {
  args = args.map(x => x.next ? x : x[Symbol.iterator]())
  let item = new Array(args.length)

  for (;;) {
    for (let inx = 0 ; inx < args.length ; ++inx) {
      let i = args[inx].next()
      if (i.done) {
        return
      }
      item[inx] = i.value
    }
    yield item
  }
}

function* enumerate(iterable, start=0) {
  for (let item of iterable) {
    yield [start++, item]
  }
}

const OP_MAP = {
  '==': '===',
  '!=': '!==',
}

/**
 * Transforms Jinja AST to ESTree.
 *
 * @see #convert
 */
class Codegen {
  constructor() {
    this._inx = 0
    this.stack = []
  }

  get _top() {
    return this.stack[this.stack.length - 1]
  }

  get context() {
    return (this._top || {}).context
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
  convert(node, block=null, flags={}) {
    if (!this[node.type]) {
      throw new Error(`Unknown node type: ${node.type}`)
    }
    return this[node.type](node, block, flags)
  }

  /**
   * Convert template's root node.
   */
  Template(node) {
    this.blocks = {}
    for (let block of node.blocks) {
      this.blocks[block.name.value] = block
    }

    this.macros = {}
    for (let macro of node.macros) {
      this.macros[macro.name.value] = macro
    }

    this.push()
    let generate = est.generator('generate', this.context)
    generate.let([[est.ident('__j_macros'), est.member(est.this(), est.ident('macros'))]])
    this.convert(node.body, generate)
    this.pop()

    let render = est.function('render', 'context')
    render.return(
      est.call(
        est.member(
          est.call(
            est.member(est.ident('Array'), est.ident('from')),
            est.call(
              est.member(est.this(), est.ident('generate')),
              est.ident('context'))),
          est.ident('join')),
        est.literal('')))

    return est.object({
      macros: est.object(node.macros.map(macro => [
        ident(macro.name), this.convert(macro)
      ])),
      generate, render,
    }, loc(node))
  }

  /**
   * Convert macro definitions.
   */
  Macro(node) {
    this.push()
    let macro = est.generator(ident(node.name), this.context, est.ident('__j_macros'))
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
    let hasVars = node.variables.length > 0

    if (hasVars) {
      let parent = node => this.context
                        ? est.member(this.context, est.ident(node))
                        : est.literal(null)
      let vars = node.variables.map(name => [
        est.ident(name), parent(name)
      ])

      let pctx = this.context
      let ctx = est.object(vars)

      this.push()
      block.let([[this.context, pctx ? est.Object.assign(ctx, pctx) : ctx]])
    }

    for (let child of node.body) {
      this.convert(child, block, { root: true })
    }

    if (hasVars) {
      this.pop()
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

  /**
   * Convert a for-loop statement.
   */
  ForLoop(node, block) {
    let inx = this._inx++
    let loop = est.ident(`__j_loop_${inx}`)
    let iter = est.iterator(this.convert(node.iterable))
    let count = est.ident(`__j_count_${inx}`)
    block.let([[loop, iter], [count, est.literal(0)]])

    let code = block.for(null, null, est.pincr(count))
    let item = est.ident(`__j_item_${inx}`)
    code.let([[item, est.call(est.member(loop, est.ident('next')))]])

    code.if(est.member(item, est.ident('done'))).then.break()

    let ctx = this.context
    this.push()
    code.let([[this.context, est.Object.assign(est.object({}), ctx)]])

    let pat = this.convert(node.pattern)
    code.add(est.set(pat, '=', est.member(item, est.ident('value'))))

    if (node.filter) {
      let filter = this.convert(node.filter)
      code.if(filter).then.continue()
    }

    this.convert(node.body, code)
    this.pop()

    if (node.alternative) {
      let else_ = block.if(est.binop(count, '===', est.literal(0))).then
      for (let child of node.alternative) {
        this.convert(child, else_)
      }
    }
  }

  /**
   * Convert a block.
   */
  CallBlock(node, block) {
    let spec = this.blocks[node.name.value]
    let code = est.generator(null)

    this.push()
    this.convert(spec.body, code)
    this.pop()

    block.add(est.yield(est.call(code), true))
  }

  /**
   * Convert macro invocation.
   */
  MacroCall(node, block) {
    let macro = this.macros[node.macro.value]
    let code = est.member(est.ident('__j_macros'), ident(node.macro))
    let args = est.object(Array.from(zip(node.args, macro.args), ([arg, spec]) => [
      ident(spec.name), this.convert(arg)
    ]))

    block.add(est.yield(est.call(code, args, est.ident('__j_macros')), true))
  }

  /**
   * Convert variable assignment.
   */
  Assign(node, block) {
    let pattern = this.convert(node.pattern)
    let value = this.convert(node.value)
    block.add(est.set(pattern, '=', value))
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
   * Convert a binary expression.
   */
  BinOp(node) {
    let left = this.convert(node.left)
    let right = this.convert(node.right)
    let op = OP_MAP[node.op.value] || node.op.value

    return est.binop(left, op, right)
  }

  /**
   * Convert variable access.
   */
  Variable(node, _, { member=false }) {
    let id = est.ident(node.name, est.loc(node.start, node.end))
    return member ? id : est.member(this.context, id)
  }

  /**
   * Convert member property access.
   */
  Member(node) {
    let object = this.convert(node.object)
    let property = this.convert(node.property, null, { member: true })
    return est.member(object, property)
  }

  /**
   * Convert a string literal.
   */
  String(node) {
    return lit(node.value, node)
  }
}
