import './lib/bootstrap';

export { default as templateFactory, TemplateFactory, Template } from './lib/template';

export { NULL_REFERENCE, UNDEFINED_REFERENCE, PrimitiveReference, ConditionalReference } from './lib/references';

export {
   default as OpcodeBuilderDSL
} from './lib/compiled/opcodes/builder';

export {
  CompilableLayout,
  compileLayout
} from './lib/compiler';

export {
  ComponentBuilder,
  ComponentArgs,
  StaticDefinition,
  DynamicDefinition
} from './lib/opcode-builder';

export {
  CompiledStaticTemplate,
  CompiledDynamicTemplate,
  CompiledDynamicBlock,
  CompiledDynamicProgram
} from './lib/compiled/blocks';

export {
  AttributeManager as IAttributeManager,
  AttributeManager,
  PropertyManager,
  INPUT_VALUE_PROPERTY_MANAGER,
  defaultManagers,
  defaultAttributeManagers,
  defaultPropertyManagers,
  readDOMAttr
} from './lib/dom/attribute-managers';

export {
  debugSlice
} from './lib/opcodes';

export {
  normalizeTextValue
} from './lib/compiled/opcodes/content';

export {
  CompiledArgs,
  CompiledNamedArgs,
  CompiledPositionalArgs,
  EvaluatedArgs,
  EvaluatedNamedArgs,
  EvaluatedPositionalArgs
} from './lib/compiled/expressions/args';

export {
  default as getDynamicVar
} from './lib/helpers/get-dynamic-var';

export {
  Blocks as BlockMacros,
  Inlines as InlineMacros,
  NestedBlockSyntax,
  CompileBlockMacro,
  compileArgs,
  setDebuggerCallback,
  resetDebuggerCallback,
  debugCallback,
  compileComponentArgs,
  compileList,
  expr as compileExpression
} from './lib/syntax/functions';

export {
  ClientSide,
  RawTemplate,
  ScannedBlock,
  ScannedProgram,
  Block,
  Program,
  compileStatement
} from './lib/scanner';

export {
  ARGS
} from './lib/compiled/opcodes/component';

export { PublicVM as VM, UpdatingVM, RenderResult } from './lib/vm';

export { SafeString, isSafeString } from './lib/upsert';

export {
  Scope,
  default as Environment,
  Helper,
  DynamicScope,
} from './lib/environment';

export {
  PartialDefinition
} from './lib/partial';

export {
  Component,
  ComponentClass,
  ComponentManager,
  ComponentDefinition,
  ComponentLayoutBuilder,
  ComponentAttrsBuilder,
  isComponentDefinition
} from './lib/component/interfaces';

export {
  ModifierManager
} from './lib/modifier/interfaces';

export { default as DOMChanges, DOMChanges as IDOMChanges, DOMTreeConstruction, isWhitespace, insertHTMLBefore } from './lib/dom/helper';
import  * as Simple from './lib/dom/interfaces';
export { Simple };
export { ElementStack, ElementOperations } from './lib/builder';
export { default as Bounds, ConcreteBounds } from './lib/bounds';
