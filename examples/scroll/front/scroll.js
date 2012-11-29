dojo.provide( 'app.scroll' );

dojo.require( 'dojox.jtlc.CHT.loader' );
dojo.require( 'adstream.data.Watcher' );
dojo.require( 'adstream.data.extensions.IncrementalContainer' );

var loader = dojox.jtlc.CHT.loader;

var keys = Object.keys || function( o ) {
	var v;
	for( var i in o )
		if( o.hasOwnProperty(i) )
			v.push( i );
	return v;
}

dojo.ready( function() {

	(new adstream.data.extensions.IncrementalContainer())
		.install( app.root.numbers );

	loader.get( 'scroll.header' )().render( 'header' );
	loader.get( 'scroll.table' )().render( 'table' );
} );

dojo.declare( 'app.scroll.Filter', dijit._Widget, {

	postCreate: function() {
		this.connect( this.domNode, 'keypress', this.onKeyPress );
	},

	onKeyPress: function() {
		setTimeout( dojo.hitch( this, 'onChange' ), 0 );
	},
	
	onChange: function() {
		if( this.valid( this.domNode.value ) ) {
			if( this.domNode.value != app.root.numbers.filter().contains ) {
				app.root.numbers.filter().contains = this.domNode.value;
				app.root.numbers.view( null );
				loader.get( 'scroll.table' )().render( 'table', 'only' );
			}
		} else {
			this.domNode.value = app.root.numbers.filter().contains;
		}
	},

	validNumbers: [
		"one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
		"ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
		"twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
		"hundred", "thousand"
	],

	valid: function( text ) {
		return dojo.some( this.validNumbers, function( num ) {
			return num.substr( 0, text.length ) == text;
		} );
	}
} );

dojo.declare( 'app.scroll.Table', [ dijit._Widget, adstream.data.Watcher ], {

	constructor: function() {
		this._firstTime = true;
	},

	postCreate: function() {
		this.strut = dojo.query( '.strut', this.domNode )[0];
		this.connect( this.domNode, 'scroll', this.checkForMore );
		this.connect( window, 'resize', this.setStrut );
	},

	setStrut: function() {
		dojo.contentBox( this.strut, { h: this.domNode.offsetHeight } );
		if( app.root.numbers.view().count > 1 )
			this.checkForMore();
	},

	startup: function() {
		this.watch( 'gotData', app.root.numbers );
		this.setStrut();
		this.more( 20 );
		this.inherited( arguments );
	},

	more: function( n ) {
		var v = app.root.numbers.view();
		v.offset += v.count;
		v.count = n;
		app.root.numbers.get();
		this._waiting = true;
	},

	checkForMore: function() {
		if( !this._waiting ) {
			var visible = this.domNode.scrollHeight - this.domNode.scrollTop - this.strut.offsetHeight;
			if( visible < this.domNode.offsetHeight )
				this.more( Math.ceil(
					visible / dojo.contentBox( this.domNode.firstChild ).h
				) );
		}
	},

	gotData: function( num, old ) {
		if( this._waiting )
			delete this._waiting;
		if( this._firstTime ) {
			loader.get( 'scroll.tableBody' )( 
				keys( num ).sort( keyComp )
			).render( this.strut, 'before' );
			delete this._firstTime;
		} else if( old.created )
			loader.get( 'scroll.tableBody' )( 
				old.created.sort( keyComp )
			).render( this.strut, 'before' );

		this.checkForMore();

		function keyComp( a, b ) { return parseInt(a) - parseInt(b); }
	}
} );

