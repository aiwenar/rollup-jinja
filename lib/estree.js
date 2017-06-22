import { inspect } from 'util'

/**
 * Create a node location.
 *
 * @return {Location}
 */
function loc(...args) {
  let source = null

  if (typeof args[0] === 'string' || args[0] === null) {
    source = args.shift()
  }

  // Either a Position object...
  let start = args.shift()
  if (typeof start === 'number') {
    // ...or a pair of numbers
    start = { line: start, column: args.shift() }
  }

  // Either a Position object...
  let end = args.shift()
  if (typeof end === 'number') {
    // ...or a pair of numbers
    end = { line: end, column: args.shift() }
  } else if (end && end.end) {
    // ...or a Location object to copy end from
    end = end.end
  }

  if (source === null && end === undefined) {
    return typeof start === 'object' ? start : null
  }

  // (must delay so that if only start location is specified the above returns
  // correct object)
  if (start && start.start) {
    // ...or a Location object to copy start from
    start = start.start
  }

  return { source, start, end }
}

function script() {
  return new Program()
}

function module_() {
  return new Program('module')
}

/**
 * Check if node is a pattern
 */
function isPattern(node) {
  return [
    'Identifier', 'AssignmentPattern', 'ObjectPattern',
  ].indexOf(node.type) !== -1
}

/**
 * Convert into a pattern.
 *
 * @return {Pattern}
 */
function pattern(pat) {
  if (typeof pat === 'string') {
    return ident(pat)
  }
  if (isPattern(pat)) {
    return pat
  }
  throw new Error(`Cannot convert ${inspect(pat, { depth: 0 })} into a pattern`)
}

/**
 * Create an identifier.
 *
 * @return {Pattern|Expression}
 */
function ident(name, l=null) {
  if (typeof name === 'string') {
    return { type: 'Identifier', name, loc: loc(l) }
  }
  if (name.type === 'Identifier') {
    return name
  }
  throw new Error(`Cannot convert ${name} into an Identifier`)
}

/**
 * Create new assignment pattern.
 *
 * @param {Pattern}    to
 * @param {Expression} value
 *
 * @return {Pattern}
 */
function assign(to, value) {
  return {
    type: 'AssignmentPattern',
    left: pattern(to),
    right: expression(value),
  }
}

/**
 * Create an object pattern.
 */
function objpat(props) {
  let properties = []

  if (props instanceof Array) {
    for (let prop of props) {
      let key, value = null
      if (prop instanceof Array && prop.length === 2) {
        [key, value] = prop
        value = assign(key, value)
      } else {
        key = prop
      }
      properties.push({
        type: 'Property',
        key: pattern(key),
        value: value === null ? pattern(key) : pattern(value),
        kind: 'init',
        shorthand: true,
      })
    }
  }

  return {
    type: 'ObjectPattern',
    properties,
  }
}

/**
 * Check if node is a literal.
 */
function isLiteral(node) {
  return node.type === 'Literal'
}

/**
 * Create a literal value.
 *
 * @return {Literal}
 */
function literal(value, l) {
  return { type: 'Literal', value, loc: loc(l) }
}

/**
 * Check if node is an expression
 */
function isExpression(node) {
  return [
    'ThisExpression', 'ArrayExpression', 'ObjectExpression',
    'FunctionExpression', 'UnaryExpression', 'UpdateExpression',
    'BinaryExpression', 'AssignmentExpression', 'LogicalExpression',
    'MemberExpression', 'ConditionalExpression', 'CallExpression',
    'NewExpression', 'SequenceExpression', 'Identifier', 'Literal',
    'ArrowFunctionExpression', 'YieldExpression',
  ].indexOf(node.type) !== -1
}

/**
 * Convert argument to an expression.
 *
 * @return {Expression}
 */
function expression(expr) {
  if (typeof expr === 'string' || typeof expr === 'number') {
    return literal(expr)
  }

  if (isExpression(expr)) {
    return expr
  }

  throw new Error(`${expr} cannot be converted into an expression`)
}

/**
 * Create a this expression.
 *
 * @return {Expression}
 */
function this_() {
  return { type: 'ThisExpression' }
}

/**
 * Create an array expression.
 *
 * @param {...Expression} args
 *
 * @return {Expression}
 */
function array(...args) {
  return {
    type: 'ArrayExpression',
    elements: args.map(expression),
  }
}

/**
 * Create an object expression.
 *
 * @param {...(Object|[Property])} args
 *
 * @return {Expression}
 */
function object(props, l=null) {
  let properties = []

  if (props instanceof Array) {
    for (let prop of props) {
      if (prop instanceof Array && prop.length === 2) {
        let [key, value] = prop
        prop = {
          type: 'Property',
          kind: 'init',
          method: value.type === 'FunctionExpression',
          value: expression(value),
          key,
        }
      } else if (prop.type !== 'Property') {
        throw new Error(`${prop} is not a property`)
      }
      properties.push(prop)
    }
  } else {
    for (let [key, value] of Object.entries(props)) {
      if (typeof key === 'string') {
        key = ident(key)
      }
      properties.push({
        type: 'Property',
        kind: 'init',
        method: value.type === 'FunctionExpression',
        value: expression(value),
        key,
      })
    }
  }

  return { type: 'ObjectExpression', properties, loc: loc(l) }
}

/**
 * Create a new function expression
 *
 * @param {Identifier} id     name
 * @param {...Pattern} params arguments
 *
 * @return {Expression}
 */
function function_(id, ...params) {
  return new Function('FunctionExpression', id, params)
}

/**
 * Create a generator expression.
 *
 * @param {Identifier} id     name
 * @param {...Pattern} params arguments
 *
 * @return {Expression}
 */
function generator(...args) {
  let fn = function_(...args)
  fn.generator = true
  return fn
}

/**
 * Create a new binary expression.
 *
 * @param {Expression}      left
 * @param {BinaryOperator}  op
 * @param {Expression}      right
 *
 * @return {Expression}
 */
function binop(left, op, right) {
  return {
    type: 'BinaryExpression',
    operator: op,
    left: expression(left),
    right: expression(right),
  }
}

/**
 * Create a new member expression.
 *
 * @param {Expression} object
 * @param {Expression} property
 *
 * @return {Exprssion}
 */
function member(object, ...property) {
  for (let prop of property) {
    prop = expression(prop)
    object = {
      type: 'MemberExpression',
      object: expression(object),
      computed: prop.type !== 'Identifier',
      property: prop,
    }
  }
  return object
}

/**
 * Create a new assignment expression
 *
 * @param {Expression|Pattern}  left
 * @param {AssignmentOperator}  op
 * @param {Expression}          right
 *
 * @return {Expression}
 */
function set(left, op, right) {
  return {
    type: 'AssignmentExpression',
    operator: op,
    left: expression(left),
    right: expression(right),
  }
}

/**
 * Create a new update expression.
 *
 * @param {UpdateOperator}  op
 * @param {Boolean}         prefix
 * @param {Expression}      argument
 *
 * @return {Expression}
 */
function update(op, prefix, argument) {
  return {
    type: 'UpdateExpression',
    operator: op,
    prefix: prefix,
    argument: expression(argument),
  }
}

const pincr = arg => update('++', true, arg)
const incrp = arg => update('++', false, arg)
const pdecr = arg => update('--', true, arg)
const decrp = arg => update('--', false, arg)

/**
 * Create a call expression
 *
 * @param {Expression}    callee
 * @param {...Expression} args
 *
 * @return {Expression}
 */
function call(callee, ...args) {
  return {
    type: 'CallExpression',
    callee: expression(callee),
    arguments: args.map(expression),
  }
}

function iterator(within) {
  return call(member(expression(within), member(ident('Symbol'), ident('iterator'))))
}

function arrow(id, ...params) {
  return new Function('ArrowFunctionExpression', id, params)
}

function arrowgen(...args) {
  let fn = arrow(...args)
  fn.generator = true
  return fn
}

/**
 * Create a yield expression.
 *
 * @param {Expression?} expr
 * @param {Boolean}     delegate
 *
 * @return {Expression}
 */
function yield_(expr, delegate=false) {
  return {
    type: 'YieldExpression',
    argument: expr === null ? null : expression(expr),
    delegate,
  }
}

/**
 * Check if node is a statement.
 */
function isStatement(node) {
  return [
    'ExpressionStatement', 'BlockStatement', 'EmptyStatement',
    'DebuggerStatement', 'WithStatement', 'ReturnStatement', 'BreakStatement',
    'ContinueStatement', 'IfStatement', 'SwitchStatement', 'ThrowStatement',
    'TryStatement', 'WhileStatement', 'DoWhileStatement', 'ForStatement',
    'ForInStatement', 'FunctionDeclaration', 'VariableDeclaration',
  ].indexOf(node.type) !== -1
}

/**
 * Convert argument into a statement.
 *
 * @return {Statement}
 */
function statement(node) {
  if (typeof node !== 'object') {
    node = expression(node)
  }
  if (isExpression(node)) {
    return { type: 'ExpressionStatement', expression: node }
  }
  if (isStatement(node)) {
    return node
  }
  throw new Error(`Cannot convert ${node.type} into a statement`)
}

/**
 * Create an empty statement.
 *
 * @return {Statement}
 */
function empty() {
  return { type: 'EmptyStatement' }
}

/**
 * Create a debugger statement.
 *
 * @return {Statement}
 */
function debugger_() {
  return { type: 'DebuggerStatement' }
}

/**
 * Create a with statement
 *
 * @param {Expression} context context object
 *
 * @return {Statement}
 */
function with_(context) {
  return new WithStatement(context)
}

/**
 * Create a return statement.
 *
 * @param {Expression?} argument value to return
 *
 * @return {Statement}
 */
function return_(argument=null) {
  return {
    type: 'ReturnStatement',
    argument: argument === null ? null : expression(argument),
  }
}

/**
 * Create a break statement.
 *
 * @return {Statement}
 */
function break_() {
  return {
    type: 'BreakStatement',
    label: null,
  }
}

/**
 * Create a continue statement.
 *
 * @return {Statement}
 */
function continue_() {
  return {
    type: 'ContinueStatement',
    label: null,
  }
}

/**
 * Create an if statement.
 *
 * @param {Expression} test
 *
 * @return {Statement}
 */
function if_(test) {
  return new IfStatement(test)
}

/**
 * Create a switch statement.
 *
 * @param {Expression} on
 *
 * @return {Statement}
 */
function switch_(on) {
  return new SwitchStatement(on)
}

/**
 * Create a new throw statement.
 *
 * @param {Expression?} argument
 *
 * @return {Statement}
 */
function throw_(argument=null) {
  return {
    type: 'ThrowStatement',
    argument: argument === null ? null : expression(argument),
  }
}

function var_(kind, vars) {
  let declarations = []

  if (vars instanceof Array) {
    for (let item of vars) {
      if (item instanceof Array && item.length === 2) {
        let [id, init] = item
        item = {
          type: 'VariableDeclarator',
          id: pattern(id),
          init: expression(init),
        }
      } else if (item.type !== 'VariableDeclarator') {
        throw new Error(`${item} is not a variable declarator`)
      }
      declarations.push(item)
    }
  } else {
    for (let [name, value] of Object.entries(vars)) {
      declarations.push({
        type: 'VariableDeclarator',
        id: pattern(name),
        init: expression(value),
      })
    }
  }

  return {
    type: 'VariableDeclaration',
    kind, declarations,
  }
}

/**
 * Create a let binding statement.
 *
 * @param {[type]} vars [description]
 *
 * @return {[type]} [description]
 */
function let_(vars) {
  return var_('let', vars)
}

function const_(vars) {
  return var_('const', vars)
}

/**
 * Create a for statement.
 *
 * @param {VariableDeclaration|Expression} init
 * @param {Expression} test
 * @param {Expression} update
 *
 * @return {Statement}
 */
function for_(init, test, update) {
  return new ForStatement(init, test, update)
}

function loop() {
  return for_(null, null, null)
}

function isModuleDeclaration(node) {
  return [
    'ExportDefaultDeclaration',
  ].indexOf(node.type) !== -1
}

function exportDefault(decl) {
  return {
    type: 'ExportDefaultDeclaration',
    declaration: decl,
  }
}

/**
 * Abstract base class for builders for node types which have bodies.
 */
class Statements {
  /**
   * Add a node to this block.
   */
  add(node) {
    throw new Error('not implemented')
  }

  /**
   * Add a block.
   *
   * @return {Statements} the block added
   */
  block() {
    let node = new BlockStatement()
    this.add(node)
    return node
  }

  /**
   * Add an empty statement.
   */
  empty(...args) {
    this.add(empty(...args))
  }

  /**
   * Add a debugger statement.
   */
  debugger(...args) {
    this.add(debugger_(...args))
  }

  /**
   * Add a with statement.
   *
   * @param {Expression} context context object
   *
   * @return {Statements} the inner block
   */
  with(...args) {
    let node = with_(...args)
    this.add(node)
    return node
  }

  /**
   * Ad a return statement.
   */
  return(...args) {
    this.add(return_(...args))
  }

  /**
   * Ad a break statement.
   */
  break(...args) {
    this.add(break_(...args))
  }

  /**
   * Add a continue statement.
   */
  continue(...args) {
    this.add(continue_(...args))
  }

  /**
   * Add an if statement.
   *
   * @param {Expression} test
   *
   * @return {IfStatement} the statement added
   */
  if(...args) {
    let node = if_(...args)
    this.add(node)
    return node
  }

  /**
   * Add a switch statement.
   *
   * @param {Expression} on the discriminant
   *
   * @return {SwitchStatement} the statement added
   */
  switch(...args) {
    let node = switch_(...args)
    this.add(node)
    return node
  }

  /**
   * Add a throw statement.
   *
   * @param {Expression} argument
   */
  throw(...args) {
    this.add(throw_(...args))
  }

  /**
   * Add a let binding.
   */
  let(vars) {
    let node = let_(vars)
    this.add(node)
    return node
  }

  for(...args) {
    let node = for_(...args)
    this.add(node)
    return node
  }

  loop() {
    let node = loop()
    this.add(node)
    return node
  }
}

class Program extends Statements {
  constructor(type='script') {
    super()
    this.type = 'Program'
    this.sourceType = type
    this.body = []
  }

  add(node) {
    this.body.push(isModuleDeclaration(node) ? node : statement(node))
  }
}

class Function extends Statements {
  constructor(type, id, params) {
    super()
    this.type = type
    this.id = id === null ? null : ident(id)
    this.params = params.map(pattern)
    this.body = new BlockStatement()
  }

  add(node) {
    this.body.add(node)
  }
}

class BlockStatement extends Statements {
  constructor() {
    super()
    this.type = 'BlockStatement'
    this.body = []
  }

  add(node) {
    this.body.push(statement(node))
  }
}

class WithStatement extends Statements {
  constructor(context) {
    super()
    this.type = 'WithStatement'
    this.object = expression(context)
    this.body = new BlockStatement()
  }

  add(node) {
    this.body.add(node)
  }
}

class IfStatement {
  constructor(test) {
    this.type = 'IfStatement'
    this.test = expression(test)
    this.consequent = new BlockStatement()
    this.alternate = null
  }

  get then() {
    return this.consequent
  }

  /**
   * End this statement with an else clause.
   *
   * @return {Statements}
   */
  else() {
    return this.alternate = new BlockStatement()
  }

  /**
   * Add an else if clause.
   *
   * @param {Expression} test
   *
   * @return {IfStatement}
   */
  elif(test) {
    return this.alternate = new IfStatement(test)
  }

  if(test) {
    return this.elif(test)
  }
}

class SwitchStatement {
  constructor(on) {
    this.type = 'SwitchStatement'
    this.discriminant = expression(on)
    this.cases = []
  }

  /**
   * Add a case arm.
   *
   * @param {Expression} test [description]
   *
   * @return {Statements}
   */
  case(test) {
    let node = new SwitchCase(test)
    this.cases.push(node)
    return node
  }
}

class SwitchCase extends Statements {
  constructor(test) {
    super()
    this.type = 'SwitchCase'
    this.test = expression(test)
    this.consequent = []
  }

  add(node) {
    this.consequent.push(super.add(node))
  }
}

class ForStatement extends Statements {
  constructor(init, test, update) {
    super()
    this.type = 'ForStatement'
    this.init = init === null ? null : init.type === 'VariableDeclaration' ? init : expression(init)
    this.test = test === null ? null : expression(test)
    this.update = update === null ? null : expression(update)
    this.body = new BlockStatement()
  }

  add(node) {
    this.body.add(node)
  }
}

const Object_ = {
  assign(...exprs) {
    return call(member(ident('Object'), ident('assign')), ...exprs)
  }
}

export default {
  loc,
  script, module: module_,
  isPattern, pattern, ident, assign, objpat,
  isLiteral, literal,
  isExpression, expression, this: this_, array, object, function: function_,
                binop, member, set, pincr, incrp, pdecr, decrp, call, iterator,
                arrow, generator, yield: yield_, arrowgen,
  isStatement, empty, debugger: debugger_, with: with_, return: return_,
               break: break_, continue: continue_, if: if_, switch: switch_,
               switch: switch_, throw: throw_, let: let_, for: for_,
  exportDefault,
  Statements, BlockStatement, SwitchStatement, SwitchCase,
  Object: Object_,
}
