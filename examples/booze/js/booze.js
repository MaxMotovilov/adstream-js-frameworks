dojo.provide( 'app.booze' );

dojo.require( 'dojo.fx' );
dojo.require( 'dojox.jtlc.CHT.loader' );
dojo.require( 'adstream.data.Service' );

dojo.require( 'dijit.Dialog' );

var loader = dojox.jtlc.CHT.loader;

dojo.ready( function() {

	var ads = adstream.data.schema;

	app.root = adstream.data.connect( '/', 
		new ads.Node( {
			lists: new ads.Object( {}, { readOnly: true } ),
			customers: new ads.Container( {
				item: new ads.Object()
			} ),
			products: new ads.Container( {
				item: new ads.Object(),
			view: {
					offset: 0,
					count: 5
				},
				filter: {}
			} ),
			orders: new ads.Container( {
				item: new ads.Object( {
					items: new ads.Container( {
						item: new ads.Object( {}, null, {

							/* Asynchronously retrieves /products/<<id>> by /orders/<<orderID>>/items/<<id>>
							   and caches the result in this._ of the item object */

							product: function() {
								return this._.product || dojo.when(
									app.root.products.get(this.id()),
									dojo.hitch( this, '_setProduct' )
								);
							},
							_setProduct: function( product ) {
								return this._.product = dojo.mixin( {}, product );
							}
						})
					} )
				} )
			} )
		} )
	);

	dojo.when( loader.require( 'booze' ), renderPage );
} );

function renderPage()
{
	loader.get( 'booze.SearchPane' )/* evaluator:function */( app.root )/* instance: HTML content */.render( 'finder', 'only' );
	loader.get( 'booze.Cart' )().render( 'right', 'only' );
	
	app.root.watch( app.booze.refreshProductList, 'products', {depth: 0 } );
	app.root.get( 'products' );

	dojo.connect( dojo.byId( 'orderButton' ), 'onclick', function() {
		(new dijit.Dialog({ 
			content: loader.get( 'booze.NotImplemented' )().toString(),
			style: "width: 400px"
		})).show();
	} );
}

dojo.declare( 'app.booze.SearchPane', dijit._Widget, {

	startup: function() {
		dojo.query( 'select[name]', this.domNode ).forEach(
			function(node) {
				this.connect( node, 'onchange', 'update' );
			}, this
		);

		var sb = dojo.byId('searchButton');

		this.connect( sb, 'onclick', 'update' );
		this.inherited( arguments );
	},

	update: function() {
		var filter = app.root.products.filter() || {};
		dojo.query( '[name]', this.domNode ).forEach(
			function(node) {
				filter[ node.name ] = node.value;
			}
		);
		app.root.products.filter( filter );
		app.root.products.view( null );
		app.root.products.get();
	}
} );

dojo.declare( 'app.booze.Cart', dijit._Widget, {

	constructor: function() {
		app.booze.cart = this;
	},

	startup: function() {
		this.connect( this.domNode, 'onclick', 'onclick' );
		this.inherited( arguments );
	},

	changeQuantity: function( product_id, quantity ) {
		var order_created = false;

		if( !app.booze.currentOrder ) {
			app.booze.currentOrder = app.root.orders.create();
			order_created = true;			
		}

		var item = app.booze.currentOrder.items[product_id];

		if( quantity > 0 ) {
			if( !item ) {
				item = app.booze.currentOrder.items.create();
				item.productID = product_id;
			}
			item.quantity = quantity;
		}

		dojo.when(
			quantity == 0 ? item.del() :
			order_created ? app.booze.currentOrder.save( 2 ) :
							item.save(),
			dojo.hitch( this, 'refresh' )
		);
	},

	onclick: function( e ) {
		if( dojo.hasClass( e.target, 'deleteButton' ) )
			this.changeQuantity( dojo.attr( e.target, 'itemID' ), 0 );
	},

	add: function( product_id ) {
		this.changeQuantity( product_id, app.booze.currentOrder && app.booze.currentOrder.items[product_id] && 
										 app.booze.currentOrder.items[product_id].quantity + 1 || 1 );
	},

	refresh: function() {
		loader.get( 'booze.CartContent' )( app.booze.currentOrder ).render( 'cartContent', 'only' );
	}
	
} );

dojo.declare( 'app.booze.Product', dijit._Widget, {

	data: null,

	startup: function() {
		this.connect( this.domNode, 'onclick', 'toggle' );
		this.connect( dojo.query( '.buyButton', this.domNode )[0], 'onclick', 'addToCart' );
		this.inherited( arguments );
	},

	toggle: function() {
		dojo.toggleClass( this.domNode, 'expanded' );
		loader.get( 'booze.ProductDescription' )( this.data, dojo.hasClass( this.domNode, 'expanded' ) ).render( this.domNode.nextSibling, 'only' );
	},

	addToCart: function(e) {
		app.booze.cart.add( this.data.id() );
		dojo.stopEvent(e);
	}
} );

app.booze.refreshProductList = function( products ) {
	loader.get( 'booze.ProductList' )( products ).render( 'main', 'only' );
}

app.booze.nextPage = function( products ) {
	var view = app.root.products.view();
	view.offset += view.count;
	app.root.products.view( view );
	app.root.products.get();
}

app.booze.prevPage = function( products ) {
	var view = app.root.products.view();
	view.offset = Math.min( 0, view.offset - 5 );
	view.count = 5;
	app.root.products.view( view );
	app.root.products.get();
}

app.booze.formatMoney = function( number ) {
	if( dojo.locale.substr( 0, 2 ) == 'ru' )
		return number.toFixed( 2 ).replace( /(.*)\.(.*)/, '$1 руб $2 коп' );
	else
		return '$' + number.toFixed( 2 );
}
