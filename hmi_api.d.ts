declare namespace sdl {
    export interface Element {
        $: {
            name: string;
            value?: string;
        };
        description?: string[];
    }

    export interface Enum {
        $: {
            name: string;
        }
        element: Element[];
        description?: string[];
    }

    export interface Param {
        $: {
            name: string;
            type: 'Boolean' | 'Integer' | 'Float' | 'String' | string;
            array?: "true";
            mandatory: 'true' | 'false';
            defvalue?: string;
            minvalue?: string;
            maxvalue?: string;
            minlength?: string;
            maxlength?: string;
        }
        description?: string[];
    }

    export interface Struct {
        $: {
            name: string;
        }
        param: Param[];
        description?: string[];
    }

    export interface Function {
        $: {
            name: string;
            functionID?: string;
            messagetype: 'request' | 'response' | 'notification';
        }
        description?: string[];
        param?: Param[];
    }

    export interface Interface {
        $: {
            name: string;
        };
        enum?: Enum[];
        struct?: Struct[];
        function?: Function[];
        description?: string[];
    }

    export interface Interfaces {
        interface: Interface[];
    }

    export interface RootObject {
        interfaces: Interfaces;
    }
}
