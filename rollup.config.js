export default {
  entry: 'index.js',
  targets: [
    { dest: 'dist/rollup-jinja.cjs.js', format: 'cjs' },
    { dest: 'dist/rollup-jinja.es.js',  format: 'es' },
  ],
  external: [
    'astring', 'util', 'rollup-pluginutils',
  ],
  sourceMap: true,
}
