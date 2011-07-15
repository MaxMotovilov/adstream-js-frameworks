dojo.provide( 'app.connector' );

dojo.require( 'dojox.jtlc.CHT.loader' );
dojo.require( 'adstream.data.Service' );

var loader = dojox.jtlc.CHT.loader;

dojo.ready( function() {

	var ads = adstream.data.schema;

	app.primary = adstream.data.connect( '/primary', 
		new ads.Node( {
			elements: new ads.Container( {
				item: new ads.Object()
			} )
		} )
	);

	app.secondary = adstream.data.connect( '/secondary', 
		new ads.Node( {
			collections: new ads.Container( {
				item: new ads.Object()
			} ),
			connectors: new ads.Node( {
				primary: new ads.Connector()
			} )
		} )
	);

	app.secondary.connectors.primary.connect( app.primary );

	dojo.when(
		loader.get( 'connector.Controls' )().render( 'controls' ),
		function() {
			dojo.query( 'input[value]', 'controls' ).forEach( function( ctl ) {
				dojo.connect( ctl, 'onclick', app.connector, dojo.attr( ctl, 'id' ) );
			} );
		}
	);

	app.primary.elements.watch( app.connector.renderElements );
	app.secondary.collections.watch( app.connector.renderCollections );

	app.primary.elements.get();
	app.secondary.collections.get();	
} );

app.connector.renderElements = function( elements )
{
	loader.get( 'connector.Elements' )( elements ).render( 'elements', 'only' );
}

app.connector.renderCollections = function( collections )
{
	loader.get( 'connector.Collections' )( collections ).render( 'collections', 'only' );
}

app.connector.addCollection = function()
{
	var rows = dojo.query( '#collections table' )[0].rows,
		new_coll = app.secondary.collections.create();

	new_coll.elements = [];

	loader.get( 'connector.CollRow' )( new_coll ).render( rows[rows.length-1], 'after' );
}

app.connector.saveCollections = function()
{
	app.secondary.collections.save();
}

dojo.declare( 'app.connector.Coll', dijit._Widget, {

	data: null,

	postCreate: function() {
		this.connect( this.domNode, 'onclick', 'beginEditing' );
	},

	beginEditing: function() {
		if( this.data.id().charAt(0) == '@' )
			loader.get( 'connector.CollEdit' )( this.data ).render( this.domNode, 'only' );
	}
} );

dojo.declare( 'app.connector.CollEdit', dijit._Widget, {

	data: null,

	postCreate: function() {
		this.connect( this.domNode, 'onblur', 'endEditing' );
	},

	startup: function() {
		this.domNode.focus();
	},

	endEditing: function() {
		setTimeout( dojo.hitch( this, function() {
			this.data.elements = this.domNode.value.split( /\s*[,;]\s*/ );
			loader.get( 'connector.CollContent' )( this.data ).render( this.domNode.parentNode, 'only' );
		} ), 0 );
	}
} );
