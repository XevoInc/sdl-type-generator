# SDL type generator

TypeScript d.ts file generator from SDL's [HMI_API.xml](https://raw.githubusercontent.com/smartdevicelink/sdl_core/master/src/components/interfaces/HMI_API.xml)

## Install

    npm install -g sdl-type-generator

## Usage

    HMI_API="https://raw.githubusercontent.com/smartdevicelink/sdl_core/master/src/components/interfaces/HMI_API.xml"
    curl $HMI_API | sdl-type-generator > type.ts
