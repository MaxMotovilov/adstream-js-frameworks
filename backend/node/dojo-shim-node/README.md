# Shim for old-style Dojo code

Use legacy client-side libraries in node.js environment without dragging around the entire Dojo toolkit.

The set of Dojo facilities provided is extremely minimalistic and targets the requirements of specific libraries.

## Usage

```
	var dojo = require( "dojo-shim-node" );
	dojo.registerPrefix( "my_dojo_lib", module );
	dojo.require( "my_dojo_lib.my_dojo_module" );

	var my_dojo_lib = dojo.global.my_dojo_lib;
	my_dojo_lib.my_dojo_module.my_dojo_function();
```

The exported object is `dojo` namespace itself with one additional function, `registerPrefix`. Other namespaces
can be accessed via `dojo.global`. To import legacy Dojo-based libraries, use `dojo.require()`.

### dojo.registerPrefix()

```
	function registerPrefix( prefix, path_or_module )
```

First argument `prefix` is Dojo namespace prefix consisting of one or more identifiers separated with dots. Second 
argument `path_or_module` could be either an absolute path to the top level directory corresponding to the prefix or
a Node.js `module` object. In the latter case, the library will look for a tree of nested directories described by
`prefix` relative to the location of `module.filename`.

## Supported Dojo APIs and classes

* [dojo.declare](https://dojotoolkit.org/reference-guide/1.7/dojo/declare.html)
* [dojo.Deferred](https://dojotoolkit.org/reference-guide/1.7/dojo/Deferred.html)
* [dojo.delegate](https://dojotoolkit.org/reference-guide/1.7/dojo/delegate.html)
* [dojo.filter](https://dojotoolkit.org/reference-guide/1.7/quickstart/arrays.html#dojo-filter)
* [dojo.forEach](https://dojotoolkit.org/reference-guide/1.7/quickstart/arrays.html#dojo-foreach)
* [dojo.getObject](https://dojotoolkit.org/reference-guide/1.7/dojo/getObject.html)
* [dojo.global](https://dojotoolkit.org/reference-guide/1.7/dojo/global.html)
* [dojo.hitch](https://dojotoolkit.org/reference-guide/1.7/dojo/hitch.html)
* [dojo.map](https://dojotoolkit.org/reference-guide/1.7/quickstart/arrays.html#dojo-map)
* [dojo.mixin](https://dojotoolkit.org/reference-guide/1.7/dojo/mixin.html)
* [dojo.objectToQuery](https://dojotoolkit.org/reference-guide/1.7/dojo/objectToQuery.html)
* [dojo.provide](https://dojotoolkit.org/reference-guide/1.7/dojo/provide.html)
* [dojo.replace](https://dojotoolkit.org/reference-guide/1.7/dojo/replace.html)
* [dojo.require](https://dojotoolkit.org/reference-guide/1.7/dojo/require.html)
* [dojo.setObject](https://dojotoolkit.org/reference-guide/1.7/dojo/setObject.html)
* [dojo.some](https://dojotoolkit.org/reference-guide/1.7/quickstart/arrays.html#dojo-some)
* [dojo.toJson](https://dojotoolkit.org/reference-guide/1.7/dojo/toJson.html)
* [dojo.when](https://dojotoolkit.org/reference-guide/1.7/dojo/when.html)
