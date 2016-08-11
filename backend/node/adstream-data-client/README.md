# Client-side adstream.data library for node.js

Access adstream.data application backends from node.js code -- perfect for running automated tests.

## Usage

```
	var adstream_data = require( "adstream-data-client" ),
		ads = adstream_data.schema,
		root = adstream_data.connect( 
			url, new ads.Node( /* Your schema here */ )
		);

	adstream_data.setHttpProvider( function( method, url, data ) {
		// Your HTTP access code -- returns a promise to JSON content
	} ); 
```

The exported object is `adstream.data` namespace with one additional function, `setHttpProvider()`. By default, only
`adstream.data.schema` and `adstream.data.Service` are imported. To import additional modules, use:

```
	var dojo = require( "dojo-shim-node" );
	dojo.require( "adstream.data.Watcher" );
```

### setHttpProvider()

Has to be called before issuing any requests. The only argument is a function that receives lowercase HTTP method name,
request URL and, optionally, a data object to be passed to the request as JSON POST body. The function should return
a promise that resolves to the JSON content returned by the server if the request succeeds.

