import { VersionedPathReference } from '@glimmer/reference';
import { ComponentDefinition } from './component/interfaces';
import { IArguments } from './vm/arguments';

import {
  Opaque,
  Option
} from '@glimmer/util';

import * as WireFormat from '@glimmer/wire-format';

import { Block } from './syntax/interfaces';

import { PublicVM } from './vm/append';
import { Resolver, Specifier } from "@glimmer/interfaces";

export type ComponentArgs = [WireFormat.Core.Params, WireFormat.Core.Hash, Option<Block>, Option<Block>];

export interface DynamicComponentDefinition {
  (
    vm: PublicVM,
    args: IArguments,
    meta: WireFormat.TemplateMeta,
    resolver: Resolver
  ): VersionedPathReference<Option<ComponentDefinition<Opaque>>>;
}

export interface ComponentBuilder {
  static(definition: Specifier, args: ComponentArgs): void;
  dynamic(definitionArgs: ComponentArgs, getDefinition: DynamicComponentDefinition, args: ComponentArgs): void;
}
