// Copyright (C) 2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "adstream.views.list.Current" );

dojo.require( "dijit._WidgetBase" );

(function(d){

function ifDifferentFrom( a, b ) {
	return a && a === b ? null : a;
}

function firstOf( a, p ) {
	for( var i=0; i<a.length; ++i )
		if( p( a[i] ) )	return a[i];
	return null;
}

function lastOf( a, p ) {
	var v = null;
	for( var i=0; i<a.length; v = a[i++] )
		if( !p( a[i] ) ) break;
	return v;
}

function leftOf( a ) {
	var ap = d.position( a );
	return function( b ) {
		var bp = d.position( b );
		return b.x + b.w <= a.x && ( b.y + b.h > a.y || b.y < a.y + a.h );
	}
}

function rightOf( a ) {
	var ap = d.position( a );
	return function( b ) {
		var bp = d.position( b );
		return a.x + a.w <= b.x && ( b.y + b.h > a.y || b.y < a.y + a.h );
	}
}

function above( a ) {
	var ap = d.position( a );
	return function( b ) {
		var bp = d.position( b );
		return b.y + b.h <= a.y && ( b.x + b.w > a.x || b.x < a.x + a.w );
	}
}

function below( a ) {
	var ap = d.position( a );
	return function( b ) {
		var bp = d.position( b );
		return a.y + a.h <= b.y && ( b.x + b.w > a.x || b.x < a.x + a.w );
	}
}

var ListContext = d.extend(
	function( items, curr ) {
		this._items = items;
		if( curr ) this._curr = curr;
	}, {
		next: function() {
			if( !this._curr )	return null;
			return ifDifferentFrom( this._tail()[0], this._curr );
		},

		previous: function() {
			if( !this._curr )	return null;
			return ifDifferentFrom( this._head().reverse()[0], this._curr );
		},

		first: function() {
			return this._items[0];
		},

		last: function() {
			return this._items[ this._items.length-1 ];
		},

		left: function() {
			if( !this._curr )	return null;
			return ifDifferentFrom( firstOf( this._head().reverse(), leftOf( this._curr ) ), this._curr );
		},

		right: function() {
			if( !this._curr )	return null;
			return ifDifferentFrom( firstOf( this._tail(), rightOf( this._curr ) ), this._curr );
		},

		up: function() {
			if( !this._curr )	return null;
			return ifDifferentFrom( firstOf( this._head().reverse(), above( this._curr ) ), this._curr );
		},

		down: function() {
			if( !this._curr )	return null;
			return ifDifferentFrom( firstOf( this._tail(), below( this._curr ) ), this._curr );
		},

		leftmost: function() {
			if( this._curr )
				return ifDifferentFrom( lastOf( this._head().reverse(), leftOf( this._curr ) ), this._curr );
			else
				return this.first();
		},

		rightmost: function() {
			if( this._curr )
				return ifDifferentFrom( lastOf( this._tail(), rightOf( this._curr ) ), this._curr );
			else
				return this._items[0] && lastOf( this._items, rightOf( this._items[0] ) );
		},

		top: function() {
			if( this._curr )
				return ifDifferentFrom( firstOf( this._head(), above( this._curr ) ), this._curr );
			else
				return this.first();
		},

		bottom: function() {
			if( this._curr )
				return ifDifferentFrom( firstOf( this._tail().reverse(), below( this._curr ) ), this._curr );
			else {
				var items = this._items.slice(0).reverse();
				return items[0] && lastOf( items, leftOf( items[0] ) );
			}
		},

		_head: function() {
			var i = this._currIndex();
			return this._items.slice( 0, i );
		},

		_tail: function() {
			var i = this._currIndex();
			return i<0 ? [] : this._items.slice( i+1 );
		},

		_currIndex: function() {
			return d.indexOf( this._items, this._curr );
		}
	}
);

dojo.declare( 'adstream.views.list.Current', dijit._WidgetBase, {

	currentItem: function() {
		return d.query( '.av-current-item', this.domNode )[0];
	},

	setCurrentItem: function( dir_or_item ) {

		var prev = this.currentItem(),
			curr = d.byId( dir_or_item );

		if( curr ) {
			if( curr === prev )	return false;
		} else {	
			// FIXME: cache the context to increase performance
			var	ctx = new ListContext( d.query( '.av-item', this.domNode ), prev );
			if( !ctx[dir] )	throw Error( "Bad argument: " + dir );

			curr = ctx[dir].call( ctx );
			if( !curr )	return false;
		}

		d.toggleClass( prev, 'av-current-item', false );
		d.toggleClass( curr, 'av-current-item', true );

		d.scrollIntoView( curr );
		return true;
	}
} );

})(dojo);

