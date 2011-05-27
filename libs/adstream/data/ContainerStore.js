// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'adstream.data.ContainerStore' );

dojo.require( 'adstream.data.schema' );
dojo.require( 'dojo.data.api.Read' );
dojo.require( 'dojo.data.api.Identity' );
dojo.require( 'dojox.json.query' );

(function() {

var d = dojo,
	dda = d.data.api,
	ad = adstream.data,
	ads = adstream.data.schema;

function ifUndefined( val, def ) {
	return typeof val === 'undefined' ? def : val;
}

function keys( dict ) {
	var	result = [];
	for( var i in dict )
		if( dict.hasOwnProperty( i ) )
			result.push( i );
	return result;
}

function toRegExpLiteral( str ) {
	if( str.indexOf( '*' ) < 0 && str.indexOf( '?' ) < 0 )	return str;

	var	eos = '$';

	return '/^' + str.replace( 
		/[.*+?{}()\[\]|\/]/g, function( ch, offs ) {
			if( ch == '*' && offs + 1 == str.length ) {
				eos = '';
				return '';
			}
			switch( ch ) {
				case '*': return '.*?';
				case '?': return '.';
				default: return '\\' + ch;
			}
		}
	) + eos + '/g';
}

d.declare( 'adstream.data.ContainerStore', [ dda.Read, dda.Identity ], {

	startAttr:	'view.offset',
	countAttr:	'view.count',
	sortAttr:	'view.orderBy',
	sizeAttr:	'extra.totalCount',

	attr: function( attr, value, orig_value ) {
		if( typeof attr === 'function' )	
			return attr( this._container, ifUndefined( orig_value, value ) );
		var qname = attr.split( '.' ),
			meta = this._container[ qname.length == 1 ? 'filter' : qname[0] ].call( this._container ),
			attr = qname[ qname.length-1 ];
		
		if( typeof value === 'undefined' )	return meta[attr];

		if( qname.length > 1 || attr in meta )
			meta[attr] = value;
	},

	_encodeSortOrder: function( sort_order, opts ) {
		return d.map( sort_order, function(i){ 
			return !opts.server === (typeof this.attr( i.attribute ) === 'undefined') ? (i.descending ? opts.desc : opts.asc) + i.attribute : ''; 
		}, this ).join( opts.sep );
	},

	encodeSortOrder: function( sort_order ) {
		return this._encodeSortOrder( sort_order, { desc: '-', asc: '', sep: ' ', server: true } );
	},

	_encodeQuery: function( query, ctr, ignore_case ) {
		return new Function( 'o', 'return ' +
			d.map( 
				d.filter( keys(query), function(i){ return typeof this.attr( i ) === 'undefined'; }, this ),
				function( i ) {
					var expr = 'o.' + (typeof ctr._subschema.item[i] === 'function' ? i + '()' : i);
					if( typeof query[i] === 'string' ) {
						var tgt = toRegExpLiteral( query[i], ignore_case );
						if( tgt === query[i] )
							return d.replace( "String({0}){1}=='{2}'", [ expr, ignore_case && '.toUpperCase()' || '', ( ignore_case ? tgt.toUpperCase() : tgt ).replace( /['\\]/g, '\\$0' ) ] );
						else
							return d.replace( "{0}{1}.test({2})", [ tgt, ignore_case && 'i' || '', expr ] );
					} else
						return d.replace( "{0}=={1}", [ expr, query[i] ] );
				}, this
			).join( '&&' )
		);
	},

	getItemList: function( ctr, fopts ) {

		var result = [],
			query = fopts.query && this._encodeQuery( fopts.query, ctr, fopts.queryOptions && fopts.queryOptions.ignoreCase );

		for( var i in ctr )
			if( ctr.hasOwnProperty(i) && ( !query || query( ctr[i] ) ) )
				result.push( ctr[i] );

		var sort_query = fopts.sort && this._encodeSortOrder( fopts.sort, { desc: '\\', asc: '/', sep: ',' } );

		if( sort_query )	return dojox.json.query( '[' + sort_query + ']', result );
		else				return result;
	},

	constructor: function( ctr, options ) {
		if( options ) d.mixin( this, options );
		this._container = ctr;
		this._queries = {};
	},

	getValue: function( item, attr, def ) {
		var val = item[attr];
		switch( typeof val ) {
			case 'function':	return val.call( item );
			case 'undefined':	return def;
			default:			return val;
		}
	},

	getIdentity: function( item ) {
		return item.id();
	},

	fetch: function( fopts ) {
		fopts.abort = function(){};

		if( 'start' in fopts )								this.attr( this.startAttr, fopts.start );
		if( 'count' in fopts && fopts.count !== Infinity )	this.attr( this.countAttr, fopts.count );
		if( 'sort' in fopts )								this.attr( this.sortAttr, this.encodeSortOrder( fopts.sort ), fopts.sort );

		if( fopts.query ) 
			for( var i in fopts.query )
				if( fopts.query.hasOwnProperty(i) )
					this.attr( i, fopts.query[i] );

		var scope = fopts.scope || d.global;

		d.when(
			this._container.get(),
			d.hitch( this, function( ctr ) {
//				if( fopts.onBegin )		fopts.onBegin.call( scope, -1, fopts );
				if( fopts.onItem )		d.forEach( this.getItemList( ctr, fopts ), function(item){ fopts.onItem.call( scope, item, fopts ); } );
				if( fopts.onComplete )	fopts.onComplete.call( scope, this.getItemList( ctr, fopts ), fopts );
			} ),
			function( err ) {
				if( fopts.onError )	fopts.onError.call( scope, err, fopts );
				return false;
			}
		);

		return fopts;
	}
} );

})();
