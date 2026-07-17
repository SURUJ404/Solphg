declare module 'bs58' {
  export function decode(input: string): Uint8Array
  export function encode(input: Uint8Array): string
}
