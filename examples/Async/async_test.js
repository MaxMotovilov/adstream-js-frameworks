dojo.provide( 'test.async_test' );

dojo.require( 'dojox.jtlc.CHT' );
dojo.require( 'adstream.data.Service' );

test.downloaded_templates = dojo.xhrGet( { url: 'async_test.cht' } ).then( 
	function(v){ return test.downloaded_templates = v; } 
);

test.templates = new dojo.Deferred();

function compileTemplates( input )
{
	test.cht = new dojox.jtlc.CHT(),
	test.compiled_templates = test.cht.parse( input );
	test.i18nDictionary = {};
	test.downloaded_templates = true;

	var promise = test.templates;
	promise.resolve( test.templates = {} );

	return true;
}

function getTemplate( name )
{
	return test.templates[name]||(
		test.templates[name] = dojox.jtlc.compile( test.compiled_templates[name], test.cht, { i18nDictionary: test.i18nDictionary } )
	);
}

dojo.ready( function() {

	var ads = adstream.data.schema;

	test.root = adstream.data.connect( '/', 
		new ads.Node( {
			options: new ads.Object( {}, { readOnly: true } ),
			table: new ads.Container( {
				item: new ads.Object( {
					data: new ads.Object( {}, { readOnly: true } )
				}, { readOnly: true } ),
				view: {
					offset: 0,
					count: 2
				}
			}, { readOnly: true } )
		} )
	);

	dojo.when( 
		dojo.when( test.downloaded_templates, compileTemplates ),
		renderPage
	);
} );

function renderPage()
{
	getTemplate( 'Test' )( test.root ).render( 'screen', 'only' );
}

