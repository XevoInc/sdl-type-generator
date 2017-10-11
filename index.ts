import * as path from 'path';
import * as ts from 'typescript';
import * as xml2js from 'xml2js';
/* tslint:disable:max-line-length */

function readSchemasFromStdin(): Promise<sdl.RootObject> {
    process.stdin.setEncoding('utf-8');
    return new Promise((resolve, reject) => {
        let data = '';
        function onRead(): void {
            /* tslint:disable:no-conditional-assignment */
            let chunk: string | Buffer;
            while (chunk = process.stdin.read()) {
                if (typeof chunk === 'string') {
                    data += chunk;
                }
            }
        }
        function onEnd(): void {
            xml2js.parseString(data, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        }
        function onError(err: any): void {
            reject(err);
        }
        process.stdin
            .on('readable', onRead)
            .once('end', onEnd)
            .once('error', onError);
    });
}

const exportKeyword = ts.createToken(ts.SyntaxKind.ExportKeyword);
const questionToken = ts.createToken(ts.SyntaxKind.QuestionToken);
const booleanKeyword = ts.createKeywordTypeNode(ts.SyntaxKind.BooleanKeyword);
const numberKeyword = ts.createKeywordTypeNode(ts.SyntaxKind.NumberKeyword);
const stringKeyword = ts.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
type PropertyDefinition = [ts.StringLiteral, ts.TypeNode];
const globalFunctionTypeMap: Map<'request' | 'response' | 'notification', PropertyDefinition[]> = new Map();

function convertJsDocComment(text: string): string {
    return `* ${text} `;
}
function addDescriptionComments<T extends ts.Node>(node: T, description?: string[], isLeading = true): T {
    if (description != null) {
        for (const text of description) {
            if (isLeading) {
                ts.addSyntheticLeadingComment(node, ts.SyntaxKind.MultiLineCommentTrivia, convertJsDocComment(text), true);
            } else {
                ts.addSyntheticTrailingComment(node, ts.SyntaxKind.MultiLineCommentTrivia, convertJsDocComment(text), true);
            }
        }
    }
    return node;
}
function createEnumStatement(node: sdl.Enum): ts.Statement {
    const name = node.$.name;
    const statement = (node.element.some((e) => !!e.$.value))
        ? ts.createEnumDeclaration(undefined, [exportKeyword], name,
            node.element.map((e) => {
                const m = ts.createEnumMember(e.$.name, e.$.value == null ? undefined : ts.createNumericLiteral(e.$.value));
                addDescriptionComments(m, e.description, false);
                return m;
            }))
        : ts.createTypeAliasDeclaration(undefined, [exportKeyword], name, undefined, ts.createUnionTypeNode(
            node.element.map((e) => {
                const m = ts.createLiteralTypeNode(ts.createLiteral(e.$.name));
                addDescriptionComments(m, e.description, false);
                return m;
            })));
    addDescriptionComments(statement, node.description);
    return statement;
}
function createPropertyExpression(param: sdl.Param): ts.PropertySignature {
    function convertType(p: sdl.Param): ts.TypeNode {
        function getBaseType() {
            switch (p.$.type) {
                case 'Boolean':
                    return booleanKeyword;
                case 'Integer':
                case 'Float':
                    return numberKeyword;
                case 'String':
                    return stringKeyword;
                default:
                    return ts.createTypeReferenceNode(p.$.type, undefined);
            }
        }
        const type = getBaseType();
        if (p.$.array === 'true') {
            return ts.createArrayTypeNode(type);
        }
        return type;
    }
    function createValueComment(p: sdl.Param): string | undefined {
        const result: string[] = [];
        if (p.$.defvalue) { result.push(`default value = ${p.$.defvalue}`); }
        if (p.$.minlength) { result.push(`minimum length = ${p.$.minlength}`); }
        if (p.$.maxlength) { result.push(`maximum length = ${p.$.maxlength}`); }
        if (p.$.minvalue) { result.push(`minimum value = ${p.$.minvalue}`); }
        if (p.$.maxvalue) { result.push(`maximum value = ${p.$.maxvalue}`); }
        return result.length === 0 ? undefined : result.join(', ');
    }

    const property = ts.createPropertySignature(undefined, param.$.name,
        param.$.mandatory === 'false' ? questionToken : undefined, convertType(param), undefined);
    addDescriptionComments(property, param.description);
    const comment = createValueComment(param);
    if (comment) {
        ts.addSyntheticLeadingComment(property, ts.SyntaxKind.MultiLineCommentTrivia, convertJsDocComment(comment), true);
    }
    return property;
}
function createStructStatement(node: sdl.Struct): ts.Statement {
    const name = node.$.name;
    const statement = ts.createInterfaceDeclaration(undefined, [exportKeyword], name, undefined, undefined, node.param.map(createPropertyExpression));
    addDescriptionComments(statement, node.description);
    return statement;
}
function createFunctionStatement(node: sdl.Function, interfaceName: string): ts.Statement {
    function generateName(): string {
        const naked = node.$.name;
        switch (node.$.messagetype) {
            case 'request': return `${naked}$Request`;
            case 'response': return `${naked}$Response`;
            case 'notification': return naked;
        }
    }
    const name = generateName();
    const statement = ts.createInterfaceDeclaration(undefined, [exportKeyword], name, undefined, undefined, node.param == null ? [] : node.param.map(createPropertyExpression));
    addDescriptionComments(statement, node.description);

    let names = globalFunctionTypeMap.get(node.$.messagetype);
    if (names == null) {
        names = [];
        globalFunctionTypeMap.set(node.$.messagetype, names);
    }
    names.push([ts.createLiteral(`${interfaceName}.${node.$.name}`), ts.createTypeReferenceNode(`${interfaceName}.${name}`, undefined)]);
    return statement;
}
function createNamespaceStatement(input: sdl.Interface): ts.Statement {
    const name = input.$.name;
    const body = [];
    if (input.enum) {
        for (const e of input.enum) {
            body.push(createEnumStatement(e));
        }
    }
    if (input.struct) {
        for (const s of input.struct) {
            body.push(createStructStatement(s));
        }
    }
    if (input.function) {
        for (const f of input.function) {
            body.push(createFunctionStatement(f, name));
        }
    }
    const result = ts.createModuleDeclaration(undefined, [exportKeyword], ts.createIdentifier(name), ts.createModuleBlock(body), ts.NodeFlags.Namespace);
    addDescriptionComments(result, input.description);
    return result;
}
function createFunctionTypeMap(typeName: string, names: PropertyDefinition[]): ts.Statement {
    return ts.createInterfaceDeclaration(undefined, [exportKeyword], typeName, undefined, undefined, names.map((name) => {
        return ts.createPropertySignature(undefined, name[0], undefined, name[1], undefined);
    }));
}
function printAST(nodes: ts.Node[]): void {
    const source = ts.createSourceFile('declares.d.ts', '', ts.ScriptTarget.ES2017);
    const printer = ts.createPrinter();

    ts.addSyntheticLeadingComment(nodes[0], ts.SyntaxKind.SingleLineCommentTrivia, ` Automatically generated by scripts/${path.basename(process.argv[1])}. DO NOT MODIFY MANUALLY.`, true);
    ts.addSyntheticLeadingComment(nodes[0], ts.SyntaxKind.MultiLineCommentTrivia, ' tslint:disable:max-line-length no-namespace no-empty-interface jsdoc-format ', true);
    for (const node of nodes) {
        console.log(printer.printNode(ts.EmitHint.Unspecified, node, source));
    }
}

function generate(schema: sdl.RootObject): ts.Statement[] {
    globalFunctionTypeMap.clear();
    const result = schema.interfaces.interface.map(createNamespaceStatement);
    {
        const names = globalFunctionTypeMap.get('notification');
        if (names) {
            result.push(createFunctionTypeMap('NotificationTypes', names));
        }
    }
    {
        const names = globalFunctionTypeMap.get('request');
        if (names) {
            result.push(createFunctionTypeMap('SendTypes', names));
        }
    }
    {
        const names = globalFunctionTypeMap.get('response');
        if (names) {
            result.push(createFunctionTypeMap('ResponseTypes', names));
        }
    }
    return result;
}

async function main() {
    const schema = await readSchemasFromStdin();
    // console.log(JSON.stringify(schema, null, 2));
    printAST(generate(schema));
}
main();
