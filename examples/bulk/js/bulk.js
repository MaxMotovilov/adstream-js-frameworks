dojo.provide( 'app.bulk' );

dojo.require( 'dojox.jtlc.CHT.loader' );
dojo.require( 'adstream.data.Service' );
dojo.require( 'adstream.data.Watcher' );

var loader = dojox.jtlc.CHT.loader;

dojo.ready( function() {

	var ads = adstream.data.schema;

	app.root = adstream.data.connect( '/', 
		new ads.Node( {
			items: new ads.Container( {
				item: new ads.Object()
			} )
		} )
	);

	dojo.when(
		loader.get( 'bulk.Controls' )().render( 'controls' ),
		function() {
			dojo.query( 'input[value]', 'controls' ).forEach( function( ctl ) {
				dojo.connect( ctl, 'onclick', app.bulk, dojo.attr( ctl, 'id' ) );
			} );
		}
	);

	app.root.items.watch( app.bulk.renderTable, { maxDepth: 0 } );
	
	dojo.when( 
		app.root.items.get(),
		function( items ) {
			if( !dojo.byId( 'theTable' ) )	
				app.bulk.renderTable( items );
		}
	);
} );

app.bulk.renderTable = function( items )
{
	for( var i in items )
		if( items.hasOwnProperty(i) && items[i]._ && items[i]._.selected )
			delete items[i]._.selected;

	loader.get( 'bulk.Table' )( items ).render( 'table', 'only' );
}

app.bulk.addItem = function()
{
	var rows = dojo.byId( 'theTable' ).rows,
		new_item = app.root.items.create();

	new_item.value = 'New item #' + rows.length;
	new_item._.selected = true;

	loader.get( 'bulk.TableRow' )( new_item ).render( rows[rows.length-1], 'after' );
}

app.bulk.deleteItems = function()
{
	// When only newly created items are deleted, no request is sent to
	// the server and watchers aren't triggered so need to update the table
	// manually in this case.
	var any = false;
	if( !app.root.items.del( function( item ) { 
		any = any || item._.selected;
		return item._.selected; 
	} ) && any )
		app.bulk.renderTable( app.root.items );
}

app.bulk.saveItems = function()
{
	app.root.items.save( function( item ) { return item._.selected; }, 1 );
}

dojo.declare( 'app.bulk.Item', [ dijit._Widget, adstream.data.Watcher ], {

	data: null,

	postCreate: function() {
		this.watch( 'onDataChanged', this.data );
	},

	onDataChanged: function() {
		// Disconnecting a watcher while another watcher is processed may result
		// in an activation of the disconnected watcher later in the same update cycle.
		if( !this._destroyed ) { 
			if( 'selected' in this.data._ )	delete this.data._.selected;
			loader.get( 'bulk.TableRowContent' )( this.data ).render( this.domNode, 'only' );
		}
	}
} );

dojo.declare( 'app.bulk.ItemCheck', dijit._Widget, {

	data: null,

	postCreate: function() {
		this.connect( this.domNode, 'onchange', 'toggleSelect' );
	},

	toggleSelect: function(e) {
		this.data._.selected = e.target.checked;
	}
} );

dojo.declare( 'app.bulk.ItemLabel', dijit._Widget, {

	data: null,

	postCreate: function() {
		this.connect( this.domNode, 'onclick', 'beginEditing' );
	},

	beginEditing: function() {
		loader.get( 'bulk.TableItemEdit' )( this.data ).render( this.domNode, 'replace' );
	}
} );

dojo.declare( 'app.bulk.ItemLabelEdit', dijit._Widget, {

	data: null,

	postCreate: function() {
		this.connect( this.domNode, 'onblur', 'endEditing' );
	},

	startup: function() {
		this.domNode.focus();
	},

	endEditing: function() {
		setTimeout( dojo.hitch( this, function() {
			this.data._.selected = this.data.value != this.domNode.value;
			this.data.value = this.domNode.value;
			loader.get( 'bulk.TableRowContent' )( this.data ).render( this.domNode.parentNode.parentNode, 'only' );
		} ), 0 );
	}
} );
