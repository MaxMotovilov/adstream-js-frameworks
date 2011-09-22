dojo.provide( 'test.async_test' );

dojo.require( 'dojo.fx' );
dojo.require( 'dojox.jtlc.CHT' );
dojo.require( 'adstream.data.Service' );

test.downloaded_templates = dojo.xhrGet( { url: 'async_test.cht' } ).then( 
	function(v){ return test.downloaded_templates = v; } 
);

test.templates = new dojo.Deferred();

function compileTemplates( input )
{
	test.cht = new dojox.jtlc.CHT(),
	test.compiled_templates = test.cht.parse( input, 'async_test.cht' );
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

	test.root.service().catchAll( onError );

	dojo.when( 
		dojo.when( test.downloaded_templates, compileTemplates ),
		renderPage
	);
} );

function onError( err )
{
	test.root.service().pause( true );
	dojo.byId( 'resume' ).disabled = false;
}

function resume()
{
	test.root.service().resume();
	dojo.byId( 'resume' ).disabled = true;
}

function renderPage()
{
	dojo.when(
		getTemplate( 'Test' )( test.root ).render( 'screen', 'only' ),
		function(){},
		function(err){ alert( err.message ); }
	);
}

test.flash = function( ctx, dom ) {
	ctx.place( dom );

	var animation = dojo.animateProperty({
		node: ctx.nodes()[0], // We know only 1 TR is returned...
		properties: {
			backgroundColor: {
				begin: 'rgba(255,255,0,255)',
				end:   'rgba(255,255,0,0)'
			}
		},
		onEnd: function( node ) {
			dojo.style( node, 'backgroundColor', '' );
			result.resolve();
		}
	});

	var result = new dojo.Deferred( 
		function(){ 
			animation.stop(); 
		} 
	);
	animation.play();
	return result;
}
