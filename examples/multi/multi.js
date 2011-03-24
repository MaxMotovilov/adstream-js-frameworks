dojo.provide( 'multi.multi' );

dojo.require( 'dojox.jtlc.CHT.loader' );
dojo.require( 'adstream.data.Service' );
dojo.require( 'adstream.data.Watcher' );

var loader = dojox.jtlc.CHT.loader;

dojo.ready( function() {

	var ads = adstream.data.schema;

	multi.root = adstream.data.connect( '/', 
		new ads.Node( {
			rows: new ads.Container( {
				item: new ads.Object( {
					cols: new ads.Container( {
						item: new ads.Object( null, null, { numId: function() { return Number( this.id() ); } } ),
						view: { 
							offset: 0,
							count: 10
						}
					} )
				}, null, { numId: function() { return Number( this.id() ); } } ),
				view: { 
					offset: 0,
					count: 10
				}
			} )
		} )
	);

	dojo.when( loader.require( 'multi' ), renderPage );

	dojo.connect( dojo.byId( 'upArrow' ), 'onclick', function() {
		var	v = multi.root.rows.view();
		if( v.offset > 0 ) {
			multi.root.rows.view( { offset: v.offset-1, count: v.count } );
			multi.root.rows.get();
		}
	} );

	dojo.connect( dojo.byId( 'downArrow' ), 'onclick', function() {
		var	v = multi.root.rows.view();
		multi.root.rows.view( { offset: v.offset+1, count: v.count } );
		multi.root.rows.get();
	} );
} );

function renderPage()
{
	multi.root.rows.watch( rowsChanged );
	multi.root.rows.get();
}

function rowsChanged( rows )
{
	loader.get( 'multi.Rows' )( rows ).render( 'rows', 'only' );
}

dojo.declare( 'multi.Row', [ dijit._Widget, adstream.data.Watcher ], {

	data: null,

	startup: function() {
		dojo.query( 'div.arrow', this.domNode ).forEach( function( elt ) {
			this.connect( elt, 'onclick', dojo.attr( elt, 'dir' ) );
		}, this );
		this.watch( 'colsChanged', this.data, 'cols' );
		if( !this.data.cols.get().then )
			this.colsChanged( this.data.cols );
	},

	left: function() {
		var	v = this.data.cols.view();
		if( v.offset > 0 ) {
			this.data.cols.view( { offset: v.offset-1, count: v.count } );
			this.data.cols.get();
		}
	},

	right: function() {
		var	v = this.data.cols.view();
		this.data.cols.view( { offset: v.offset+1, count: v.count } );
		this.data.cols.get();
	},

	colsChanged: function( cols ) {
		loader.get( 'multi.Cols' )( cols ).render( dojo.query( 'div.cols', this.domNode )[0], 'only' );
	}
} );
