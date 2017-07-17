import { CompilationMeta, Opaque, Option, Specifier } from '@glimmer/interfaces';
import { dict, EMPTY_ARRAY, expect, fillNulls, Stack, typePos } from '@glimmer/util';
import { Op, Register } from '@glimmer/vm';
import * as WireFormat from '@glimmer/wire-format';
import { Handle, Heap, Program } from '../../environment';
import {
  ConstantArray,
  ConstantOther,
  Constants,
  ConstantString,
  LazyConstants,
} from '../../environment/constants';
import { ComponentBuilder as IComponentBuilder } from '../../opcode-builder';
import { Primitive } from '../../references';
import { CompilationOptions } from '../../syntax/compilable-template';
import { expr } from '../../syntax/functions';
import { Block } from '../../syntax/interfaces';
import RawInlineBlock from '../../syntax/raw-block';
import { TemplateMeta } from "@glimmer/wire-format";
import { ComponentBuilder } from "../../compiler";

export interface CompilesInto<E> {
  compile(builder: OpcodeBuilder): E;
}

export type Represents<E> = CompilesInto<E> | E;

export type Label = string;

type TargetOpcode = Op.Jump | Op.JumpIf | Op.JumpUnless | Op.EnterList | Op.Iterate | Op.ReturnTo;

class Labels {
  labels = dict<number>();
  targets: Array<{ at: number, Target: TargetOpcode, target: string }> = [];

  label(name: string, index: number) {
    this.labels[name] = index;
  }

  target(at: number, Target: TargetOpcode, target: string) {
    this.targets.push({ at, Target, target });
  }

  patch(program: Program): void {
    let { targets, labels } = this;
    for (let i = 0; i < targets.length; i++) {
      let { at, target } = targets[i];
      let goto = labels[target] - at;
      program.heap.setbyaddr(at + 1, goto);
    }
  }
}

export abstract class OpcodeBuilder {
  public constants: Constants;
  public heap: Heap;
  public start: Handle;

  private labelsStack = new Stack<Labels>();
  private isComponentAttrs = false;
  public component: IComponentBuilder = new ComponentBuilder(this);

  constructor(public options: CompilationOptions, public meta: CompilationMeta, public program: Program = options.program) {
    this.constants = program.constants;
    this.heap = program.heap;
    this.start = this.heap.malloc();
  }

  private get pos() {
    return typePos(this.heap.size());
  }

  private get nextPos() {
    return this.heap.size();
  }

  upvars<T extends [Opaque]>(count: number): T {
    return fillNulls(count) as T;
  }

  reserve(name: Op) {
    this.push(name, 0, 0, 0);
  }

  push(name: Op, op1 = 0, op2 = 0, op3 = 0) {
    this.heap.push(name);
    this.heap.push(op1);
    this.heap.push(op2);
    this.heap.push(op3);
  }

  finalize(): Handle {
    this.push(Op.Return);
    this.heap.finishMalloc(this.start);
    return this.start;
  }

  setComponentAttrs(enabled: boolean): void {
    this.isComponentAttrs = enabled;
  }

  // args

  pushArgs(names: string[], positionalCount: number, synthetic: boolean) {
    let serialized = this.constants.stringArray(names);
    this.push(Op.PushArgs, serialized, positionalCount, synthetic === true ? 1 : 0);
  }

  // helpers

  private get labels(): Labels {
    return expect(this.labelsStack.current, 'bug: not in a label stack');
  }

  startLabels() {
    this.labelsStack.push(new Labels());
  }

  stopLabels() {
    let label = expect(this.labelsStack.pop(), 'unbalanced push and pop labels');
    label.patch(this.program);
  }

  // components

  pushComponentManager(specifier: Specifier) {
    this.push(Op.PushComponentManager, this.constants.specifier(specifier));
  }

  pushDynamicComponentManager(meta: TemplateMeta) {
    this.push(Op.PushDynamicComponentManager, this.constants.serializable(meta));
  }

  prepareArgs(state: Register) {
    this.push(Op.PrepareArgs, state);
  }

  createComponent(state: Register, hasDefault: boolean, hasInverse: boolean) {
    let flag = (hasDefault === true ? 1 : 0) | ((hasInverse === true ? 1 : 0) << 1);
    this.push(Op.CreateComponent, flag, state);
  }

  registerComponentDestructor(state: Register) {
    this.push(Op.RegisterComponentDestructor, state);
  }

  beginComponentTransaction() {
    this.push(Op.BeginComponentTransaction);
  }

  commitComponentTransaction() {
    this.push(Op.CommitComponentTransaction);
  }

  putComponentOperations() {
    this.push(Op.PutComponentOperations);
  }

  getComponentSelf(state: Register) {
    this.push(Op.GetComponentSelf, state);
  }

  getComponentTagName(state: Register) {
    this.push(Op.GetComponentTagName, state);
  }

  invokeComponentLayout(state: Register ) {
    this.push(Op.InvokeComponentLayout, state);
  }

  didCreateElement(state: Register) {
    this.push(Op.DidCreateElement, state);
  }

  didRenderLayout(state: Register) {
    this.push(Op.DidRenderLayout, state);
  }

  // partial

  invokePartial(meta: TemplateMeta, symbols: string[], evalInfo: number[]) {
    let _meta = this.constants.serializable(meta);
    let _symbols = this.constants.stringArray(symbols);
    let _evalInfo = this.constants.array(evalInfo);

    this.push(Op.InvokePartial, _meta, _symbols, _evalInfo);
  }

  resolveMaybeLocal(name: string) {
    this.push(Op.ResolveMaybeLocal, this.string(name));
  }

  // debugger

  debugger(symbols: string[], evalInfo: number[]) {
    this.push(Op.Debugger, this.constants.stringArray(symbols), this.constants.array(evalInfo));
  }

  // content

  dynamicContent(isTrusting: boolean) {
    this.push(Op.DynamicContent, isTrusting ? 1 : 0);
  }

  // dom

  text(text: string) {
    this.push(Op.Text, this.constants.string(text));
  }

  openPrimitiveElement(tag: string) {
    this.push(Op.OpenElement, this.constants.string(tag));
  }

  openElementWithOperations(tag: string) {
    this.push(Op.OpenElementWithOperations, this.constants.string(tag));
  }

  openDynamicElement() {
    this.push(Op.OpenDynamicElement);
  }

  flushElement() {
    this.push(Op.FlushElement);
  }

  closeElement() {
    this.push(Op.CloseElement);
  }

  staticAttr(_name: string, _namespace: Option<string>, _value: string) {
    let name = this.constants.string(_name);
    let namespace = _namespace ? this.constants.string(_namespace) : 0;

    if (this.isComponentAttrs) {
      this.pushPrimitiveReference(_value);
      this.push(Op.ComponentAttr, name, 1, namespace);
    } else {
      let value = this.constants.string(_value);
      this.push(Op.StaticAttr, name, value, namespace);
    }
  }

  dynamicAttr(_name: string, _namespace: Option<string>, trusting: boolean) {
    let name = this.constants.string(_name);
    let namespace = _namespace ? this.constants.string(_namespace) : 0;

    if (this.isComponentAttrs) {
      this.push(Op.ComponentAttr, name, (trusting === true ? 1 : 0), namespace);
    } else {
      this.push(Op.DynamicAttr, name, (trusting === true ? 1 : 0), namespace);
    }
  }

  comment(_comment: string) {
    let comment = this.constants.string(_comment);
    this.push(Op.Comment, comment);
  }

  modifier(specifier: Specifier) {
    this.push(Op.Modifier, this.constants.specifier(specifier));
  }

  // lists

  putIterator() {
    this.push(Op.PutIterator);
  }

  enterList(start: string) {
    this.reserve(Op.EnterList);
    this.labels.target(this.pos, Op.EnterList, start);
  }

  exitList() {
    this.push(Op.ExitList);
  }

  iterate(breaks: string) {
    this.reserve(Op.Iterate);
    this.labels.target(this.pos, Op.Iterate, breaks);
  }

  // expressions

  setVariable(symbol: number) {
    this.push(Op.SetVariable, symbol);
  }

  getVariable(symbol: number) {
    this.push(Op.GetVariable, symbol);
  }

  getProperty(key: string) {
    this.push(Op.GetProperty, this.string(key));
  }

  getBlock(symbol: number) {
    this.push(Op.GetBlock, symbol);
  }

  hasBlock(symbol: number) {
    this.push(Op.HasBlock, symbol);
  }

  hasBlockParams(symbol: number) {
    this.push(Op.HasBlockParams, symbol);
  }

  concat(size: number) {
    this.push(Op.Concat, size);
  }

  load(register: Register) {
    this.push(Op.Load, register);
  }

  fetch(register: Register) {
    this.push(Op.Fetch, register);
  }

  dup(register = Register.sp, offset = 0) {
    return this.push(Op.Dup, register, offset);
  }

  pop(count = 1) {
    return this.push(Op.Pop, count);
  }

  // vm

  pushRemoteElement() {
    this.push(Op.PushRemoteElement);
  }

  popRemoteElement() {
    this.push(Op.PopRemoteElement);
  }

  label(name: string) {
    this.labels.label(name, this.nextPos);
  }

  pushRootScope(symbols: number, bindCallerScope: boolean) {
    this.push(Op.RootScope, symbols, (bindCallerScope ? 1 : 0));
  }

  pushChildScope() {
    this.push(Op.ChildScope);
  }

  popScope() {
    this.push(Op.PopScope);
  }

  returnTo(label: string) {
    this.reserve(Op.ReturnTo);
    this.labels.target(this.pos, Op.ReturnTo, label);
  }

  pushDynamicScope() {
    this.push(Op.PushDynamicScope);
  }

  popDynamicScope() {
    this.push(Op.PopDynamicScope);
  }

  primitive(_primitive: Primitive) {
    let flag: 0 | 1 | 2 = 0;
    let primitive: number;
    switch (typeof _primitive) {
      case 'number':
        primitive = _primitive as number;
        break;
      case 'string':
        primitive = this.string(_primitive as string);
        flag = 1;
        break;
      case 'boolean':
        primitive = (_primitive as any) | 0;
        flag = 2;
        break;
      case 'object':
        // assume null
        primitive = 2;
        flag = 2;
        break;
      case 'undefined':
        primitive = 3;
        flag = 2;
        break;
      default:
        throw new Error('Invalid primitive passed to pushPrimitive');
    }

    this.push(Op.Primitive, (flag << 30) | primitive);
  }

  pushPrimitiveReference(primitive: Primitive) {
    this.primitive(primitive);
    this.primitiveReference();
  }

  primitiveReference() {
    this.push(Op.PrimitiveReference);
  }

  helper(helper: Specifier) {
    this.push(Op.Helper, this.constants.specifier(helper));
  }

  abstract pushBlock(block: Option<Block>): void;
  abstract pushSymbolTable(block: Option<Block>): void;

  bindDynamicScope(_names: string[]) {
    this.push(Op.BindDynamicScope, this.names(_names));
  }

  enter(args: number) {
    this.push(Op.Enter, args);
  }

  exit() {
    this.push(Op.Exit);
  }

  return() {
    this.push(Op.Return);
  }

  pushFrame() {
    this.push(Op.PushFrame);
  }

  popFrame() {
    this.push(Op.PopFrame);
  }

  invokeStatic(): void {
    this.push(Op.InvokeStatic);
  }

  invokeYield(): void {
    this.push(Op.InvokeYield);
  }

  toBoolean() {
    this.push(Op.ToBoolean);
  }

  jump(target: string) {
    this.reserve(Op.Jump);
    this.labels.target(this.pos, Op.Jump, target);
  }

  jumpIf(target: string) {
    this.reserve(Op.JumpIf);
    this.labels.target(this.pos, Op.JumpIf, target);
  }

  jumpUnless(target: string) {
    this.reserve(Op.JumpUnless);
    this.labels.target(this.pos, Op.JumpUnless, target);
  }

  // internal helpers

  string(_string: string): ConstantString {
    return this.constants.string(_string);
  }

  protected names(_names: string[]): ConstantArray {
    let names: number[] = [];

    for (let i = 0; i < _names.length; i++) {
      let n = _names[i];
      names[i]= this.constants.string(n);
    }

    return this.constants.array(names);
  }

  protected symbols(symbols: number[]): ConstantArray {
    return this.constants.array(symbols);
  }

  // convenience methods

  compileParams(params: Option<WireFormat.Core.Params>) {
    if (!params) return 0;

    for (let i = 0; i < params.length; i++) {
      expr(params[i], this);
    }

    return params.length;
  }

  compileArgs(params: Option<WireFormat.Core.Params>, hash: Option<WireFormat.Core.Hash>, synthetic: boolean) {
    let count = this.compileParams(params);

    let names: string[] = EMPTY_ARRAY;

    if (hash) {
      names = hash[0];
      let val = hash[1];
      for (let i = 0; i < val.length; i++) {
        expr(val[i], this);
      }
    }

    this.pushArgs(names, count, synthetic);
  }

  compile<E>(expr: Represents<E>): E {
    if (isCompilableExpression(expr)) {
      return expr.compile(this);
    } else {
      return expr;
    }
  }

  invokeStaticBlock(block: Block, callerCount = 0): void {
    let { parameters } = block.symbolTable;
    let calleeCount = parameters.length;
    let count = Math.min(callerCount, calleeCount);

    this.pushFrame();

    if (count) {
      this.pushChildScope();

      for (let i = 0; i < count; i++) {
        this.dup(Register.fp, callerCount - i);
        this.setVariable(parameters[i]);
      }
    }

    this.pushBlock(block);
    this.invokeStatic();

    if (count) {
      this.popScope();
    }

    this.popFrame();
  }

  guardedAppend(expression: WireFormat.Expression, trusting: boolean) {
    this.startLabels();

    this.pushFrame();

    this.returnTo('END');

    expr(expression, this);

    this.dup();
    this.isComponent();

    this.enter(2);

    this.jumpUnless('ELSE');

    this.pushDynamicComponentManager(this.meta.templateMeta);
    this.invokeComponent(null, null, null, false, null, null);

    this.exit();

    this.return();

    this.label('ELSE');

    this.dynamicContent(trusting);

    this.exit();

    this.return();

    this.label('END');

    this.popFrame();

    this.stopLabels();
  }

  yield(to: number, params: Option<WireFormat.Core.Params>) {
    this.compileArgs(params, null, false);
    this.getBlock(to);
    this.invokeYield();
    this.popScope();
    this.popFrame();
  }

  invokeComponent(attrs: Option<RawInlineBlock>, params: Option<WireFormat.Core.Params>, hash: WireFormat.Core.Hash, synthetic: boolean, block: Option<Block>, inverse: Option<Block> = null) {
    this.fetch(Register.s0);
    this.dup(Register.sp, 1);
    this.load(Register.s0);

    this.pushYieldableBlock(block);
    this.pushYieldableBlock(inverse);
    this.pushYieldableBlock(attrs && attrs.scan());

    this.compileArgs(params, hash, synthetic);
    this.prepareArgs(Register.s0);

    this.beginComponentTransaction();
    this.pushDynamicScope();
    this.createComponent(Register.s0, block !== null, inverse !== null);
    this.registerComponentDestructor(Register.s0);

    this.getComponentSelf(Register.s0);
    this.invokeComponentLayout(Register.s0);
    this.popFrame();

    this.popScope();
    this.popDynamicScope();
    this.commitComponentTransaction();

    this.load(Register.s0);
  }

  dynamicComponent(definition: WireFormat.Expression, /* TODO: attrs: Option<RawInlineBlock>, */ params: Option<WireFormat.Core.Params>, hash: WireFormat.Core.Hash, synthetic: boolean, block: Option<Block>, inverse: Option<Block> = null) {
    this.startLabels();

    this.pushFrame();

    this.returnTo('END');

    expr(definition, this);

    this.dup();

    this.enter(2);

    this.jumpUnless('ELSE');

    this.pushDynamicComponentManager(this.meta.templateMeta);
    this.invokeComponent(null, params, hash, synthetic, block, inverse);

    this.label('ELSE');
    this.exit();
    this.return();

    this.label('END');
    this.popFrame();

    this.stopLabels();
  }

  isComponent() {
    this.push(Op.IsComponent);
  }

  curryComponent(definition: WireFormat.Expression, /* TODO: attrs: Option<RawInlineBlock>, */ params: Option<WireFormat.Core.Params>, hash: WireFormat.Core.Hash, synthetic: boolean) {
    let meta = this.meta.templateMeta;

    expr(definition, this);
    this.compileArgs(params, hash, synthetic);
    this.push(Op.CurryComponent, this.constants.serializable(meta));
  }

  pushYieldableBlock(block: Option<Block>): void {
    this.pushSymbolTable(block);
    this.pushBlock(block);
  }

  template(block: Option<WireFormat.SerializedInlineBlock>): Option<RawInlineBlock> {
    if (!block) return null;
    return new RawInlineBlock(block.statements, block.parameters, this.meta, this.options);
  }
}

export default OpcodeBuilder;

function isCompilableExpression<E>(expr: Represents<E>): expr is CompilesInto<E> {
  return typeof expr === 'object' && expr !== null && typeof (expr as CompilesInto<E>).compile === 'function';
}

export class LazyOpcodeBuilder extends OpcodeBuilder {
  public constants: LazyConstants;

  pushSymbolTable(block: Option<Block>) {
    if (block) {
      this.pushOther(block.symbolTable);
    } else {
      this.primitive(null);
    }
  }

  pushBlock(block: Option<Block>) {
    if (block) {
      this.pushOther(block);
    } else {
      this.primitive(null);
    }
  }

  invokeYield() {
    this.compileBlock();
    super.invokeYield();
  }

  invokeStatic() {
    this.compileBlock();
    super.invokeStatic();
  }

  protected pushOther<T>(value: T) {
    this.push(Op.Constant, this.other(value));
  }

  protected compileBlock() {
    this.push(Op.CompileBlock);
  }

  protected other(value: Opaque): ConstantOther {
    return this.constants.other(value);
  }
}

// export class EagerOpcodeBuilder extends OpcodeBuilder {
// }

export type BlockCallback = (dsl: OpcodeBuilder, BEGIN: Label, END: Label) => void;
