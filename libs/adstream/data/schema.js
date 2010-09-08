dojo.provide( 'adstream.data.schema' );

(function() {
	var	id = 0;
	adstream.data.schema._uniqueID = function() { return ++id; }
})();

adstream.data._splitURL = function( url ) {
	return /^(.*)\/([^\/]*)$/.exec( url ) || [ url, url, '' ];
}

adstream.data.schema._identical = function( a, b ) {

	if( typeof a !== 'object' && typeof b !== 'object' )
		return !a == !b && a.toString() == b.toString();
	else if( typeof a !== typeof b )
		return false;

	for( var i in a )
		if( !adstream.data.schema._identical( a[i], b[i] ) )
			return false;

	for( var i in b )
		if( !(i in a) )	return false;

	return true;	
}

adstream.data.schema._mixIfNotPresent = function( dst, src ) {
	for( var i in src ) {
		if( i in src && i in dst && !adstream.data.schema._identical( src[i], dst[i] ) )
			return false;
		dst[i] = src[i];
	}
	return true;
}

adstream.data._descend = function( rel_url, obj, step ) {
	step = step || adstream.data.schema._byInstance;

	var	last = null;	
	
	return {
		rel_url: rel_url.replace( /([^/]*)(?:\/|$)/g, function(ctx,path_item) {
			if( ctx && obj ) {
				last = obj;
				obj = step( obj, path_item );
			}
			return obj ? '' : ctx;
		} ),
		obj: obj || last
	};
}

adstream.data.schema._byInstance = function( obj, path_item ) {
	var	ret;
	return obj.hasOwnProperty(path_item) && 
		   (ret = obj[path_item]) instanceof adstream.data.schema.Node &&
		   ret;
}

adstream.data.schema._bySchema = function( obj, path_item ) {
	var ret = obj._schemaProp( path_item );
	return ret && (ret instanceof adstream.data.schema.Node) && ret;
}

adstream.data.schema._byAutoInstantiatedSchema = function( obj, path_item ) {
	var p;

	if( p = adstream.data.schema._byInstance( obj, path_item ) )	
		return p;

	if( (p = obj._schemaProp( path_item )) && p.constructor === adstream.data.schema.Node )
		return obj[path_item] = p._new( obj._service, obj._url + '/' + path_item );

	return null;
}

adstream.data.schema._descendSchema = function( rel_url, obj )
{
	var d = adstream.data._descend( rel_url, obj, adstream.data.schema._bySchema );
	if( d.rel_url )	throw Error( obj._url + '/' + rel_url + ' does not specify an object in the schema' );
	return d.obj;
}

dojo.declare( 'adstream.data.schema.Node', null, {

	constructor: function( sub ) {
		this._subschema = sub || {};
		this._ = {};

		for( var i in this._subschema ) {
			if( this._subschema[i] instanceof adstream.data.schema.Method )
				this[i] = this._subschema[i].body;
		}
	},

	_ego: function() {
		for( var ego = this; !ego.hasOwnProperty('_subschema'); ego = ego.constructor.prototype )
			if( ego === Object.constructor.prototype )	
				throw Error( 'Ego-less schema object!' );
		return ego; 
	},

	_new: function( svc, url ) {
		var	ego = this._ego(),
			impl = dojo.delegate( ego, {
				_: 			dojo.delegate( ego._, {} ),
				_service: 	svc,
				_url:		url
			} );

		return dojo.delegate( impl, {} );
	},

	_instantiateSchema: function() {
		for( var i in this._subschema )
			if( this._subschema[i] instanceof adstream.data.schema.Node ) {
				this[i] = this._subschema[i]._new( this._service, this._composeURL( i ) );
				this[i]._instantiateSchema();
			}
	},

	_composeURL: function( rel_url ) {
		return rel_url ? this._url ? this._url + '/' + rel_url : rel_url : this._url;
	},

	_schemaProp: function( path_item ) {
		return this._subschema[path_item] || null;
	},

	_wrap: function( data ) {
		if( !data )	throw Error( "Attempt to save a read-only or unmodified object " + this._url );
		var result = {};
		result[this._url] = data;
		return result;
	},

	_marshal: function( depth ) {

		var	result = null;

		if( depth ) {
			var to = {}, item;
			for( var i in this )
				if( this.hasOwnProperty(i) &&
					this[i] instanceof adstream.data.schema.Node &&
					(item = this[i]._marshal( depth-1 )) ) {
					to[i] = item;
					result = to;
				}
		}

		return result;
	},

	_unmarshal: function( data ) { return false; },

	_safePropSet: function( prop, value ) {
		var any = false;
		for( var f in value ) {
			if( this._.prop && this._.prop[f] === value[f] )
				continue;
			any = true;
			if( !this._.hasOwnProperty( prop ) )
				this._[prop] = this._[prop] ? dojo.delegate( this._[prop], {} ) : {};
			if( value[f]===null ) {
				if( this._[prop].hasOwnProperty(f) )
					delete this._[prop][f];
			} else	this._[prop][f] = value[f];
		}
		return any;
	},

	_copyPropsIfChanged: function( src, props ) {
		var	any = false;

		if( src._ )	dojo.forEach( props, function(prop) {
			
			if( !src._[prop] )	return;

			if( typeof src._[prop] === 'object' )
				any = this._safePropSet( prop, src._[prop] ) || any;
			else if( src._[prop] !== this._[prop] ) {
				this._[prop] = src._[prop];
				any = true;
			}
		}, this );

		return any;
	},

	_isInstance: function() {
		return !this.hasOwnProperty( '_' );
	},

	_notYetCreated: function() {
		return this._url.indexOf( '@' ) >= 0;
	},

	_URL_Params: function( verb, depth ) { 
		var result = {};
		if( depth )
			for( var sp in this._subschema ) 
				if( !adstream.data.schema._mixIfNotPresent( 
					result, (this[sp] || this._subschema[sp])._URL_Params( verb, depth-1 ) 
				) )
					throw Error( "URL parameters conflict in request to " + this._url + " with depth " + depth );
		return result;
	},

	_saveIfNotCreated: function() {
		if( /@.*[\/]/.test( this._url ) )
			throw Error( "Cannot save " + this._url + " as its parent has not yet been saved" );
		var split_url = adstream.data._splitURL( this._url ),
			d = adstream.data._descend( split_url[1], this._service.root );

		if( d.rel_url )	throw Error( "Object at " + this._url + " is not connected to schema" );

		return d.obj.save( split_url[2] );
	},

	url: function() { return this._url; },
	
	service: function() { return this._service; },

	get: function( rel_url, depth ) {
		var	d = adstream.data._descend( rel_url||'', this );
		if( !d.rel_url && !d.obj._.outOfSync && (depth||d.obj._defaultGetDepth||0) <= (d.obj._.depth||0) ) return d.obj;

		var	schema_obj = adstream.data.schema._descendSchema( d.rel_url, this ),
			params = schema_obj._URL_Params( "GET", depth );

		if( depth = depth||schema_obj._defaultGetDepth||0 )
			params.depth = depth;

		return this._service.GET( this._composeURL( rel_url ), params );
	},

	on_sync: function( cb, rel_url, max_depth, min_depth ) {

		if( typeof rel_url === 'number' ) {
			min_depth = max_depth || 0;
			max_depth = rel_url;
			rel_url = '';
		}

		this._service.on_sync( cb, this._composeURL( rel_url ), max_depth||0, min_depth||0 );
	},

	save: function( depth ) {
		if( this._notYetCreated() )
			return this._saveIfNotCreated();
		return this._service.PUT( this._url, this._wrap( this._marshal( depth||0 ) ) );
	}
} );


dojo.declare( 'adstream.data.schema.Object', [ adstream.data.schema.Node ], {

	constructor: function() {
		if( this._subschema.readOnly ) {
			this.readOnly = true;
			delete this._subschema.readOnly;
		}
	},
	
	_unmarshal: function( data ) {

		if( data._ &&
			!this._copyPropsIfChanged( data, [ 'version' ] ) )
			return false;

		for( var i in this )
			if( this.hasOwnProperty(i) && !(this[i] instanceof adstream.data.schema.Node) )
				delete this[i];

		for( var i in data )
			if( i != '_' )	this[i] = data[i];

		return true;
	},

	_marshal: function( depth ) {

		if( this.readOnly )	return null;
	
		var to = {}, item;

		if( this._.version )	
			to._= { version: this._.version };

		for( var i in this ) {
			if( !this.hasOwnProperty(i) )	continue;
			if( !(this[i] instanceof adstream.data.schema.Node) )
				to[i] = this[i];
			else if( depth && (item = this[i]._marshal( depth-1 )) )
				to[i] = item;
		}
		
		return to;
	}

} );


dojo.declare( 'adstream.data.schema.Container', [ adstream.data.schema.Node ], {

	constructor: function() {
	
		if( !this._subschema.item )	
			throw Error( "Container must have an 'item' slot in its subschema" );

		this._defaultSetting( 'filter' );
		this._defaultSetting( 'view' );
		this._defaultSetting( 'extra' );

		this._subschema.item.del = this._itemDelete;
	},

	_defaultGetDepth: 1,

	_defaultSetting: function( name ) {
		if( name in this._subschema ) {
			this._[name] = this._subschema[name];
			delete this._subschema[name];
		}
	},

	_instantiateSchema: function() {},

	_schemaProp: function( path_item ) {
		//	Assuming that any item ID except '_' is valid
		return path_item == '_' ? null : this._subschema.item;
	},

	_itemDelete: function() {	// Visitor on the item object

		if( this._notYetCreated() ) {
			var	split_url = adstream.data._splitURL( this._url ),
				d = adstream.data.schema._descend( split_url[1], this._service.root );

			if( d.rel_url )	throw Error( "Object at " + this._url + " is not connected to schema" );
		
			return d.obj.del( split_url[2] );

		} else {
			return this._service.DELETE( this._url, { version: this._.version } );
		}
	},

	_unmarshal: function( data, props ) {

		if( data._ &&
			this._copyPropsIfChanged( data, [ 'filter', 'view', 'extra' ] ) ) {
			//	Replacing the entire content
			for( var i in this )
				if( this.hasOwnProperty(i) )
					delete this[i];
			return true;
		}

		var	result = false;

		for( var i in props )
			if( !props[i] ) {
				if( this.hasOwnProperty(i) ) {
					delete this[i];
					result = true;
				}
			} else if( props[i]._ && props[i]._.replaces &&
					   props[i]._.replaces in this ) {
				this[i] = this[ props[i]._.replaces ];
				delete this[ props[i]._.replaces ];
				result = true;
			}

		return result;
	},

	_marshal: function() { // Depth is ignored as new objects are always saved completely
		var result = null, to = {}, item;

		for( var i in this )
			if( this.hasOwnProperty(i) && i.charAt(0)=='@' &&
				(item = this[i]._marshal( -1 )) ) {
				to[i] = item;
				result = to;
			}
		
		return result;		
	},

	_URL_Params: function( verb, depth ) {

		var result = {};
		dojo.forEach( [ 'filter', 'view', 'extra' ], function(p) {
			if( p in this._ )	dojo.mixin( result, this._[p] );
		}, this );

		if( depth )
			for( var i in this ) 
				if( this.hasOwnProperty(i) && this[i] instanceof adstream.data.schema.Node &&
					!adstream.data.schema._mixIfNotPresent( 
						result, this[i]._URL_Params( verb, depth-1 ) 
				) )
					throw Error( "URL parameters conflict in request to " + this._url + " with depth " + depth );

		return result;
	},

	create: function() {
		var temp_id = '@' + adstream.data.schema._uniqueID(),
			result = this._subschema.item._new( this._service, this._composeURL( temp_id ) );
		result._instantiateSchema();
		return this[temp_id] = result;
	},

	del: function( item_id ) {
		if( this._notYetCreated() || item_id.charAt(0)=='@' ) {
			delete this[item_id];
			return null;
		} else {
			return this[item_id].del();
		}
	},

	save: function( item_id, depth ) {
		
		if( item_id ) {
			if( !(item_id in this) )
				throw Error( "Attempt to save a non-existing item " + this._composeURL( item_id ) );
			if( item_id.toString().charAt(0) == '@' )
					return this._service.POST( this._url, this[item_id]._wrap( this[item_id]._marshal( -1 ) ) );
			else	return this[item_id].save( depth );
		} else		return this._service.POST( this._url, this._wrap( this._marshal() ) );
	},

	filter: function( new_filter ) {
		if( typeof new_filter !== 'undefined' )	{
			if( new_filter )			this._safePropSet( 'filter', new_filter );
			else if( this._.filter )	delete this._.filter;
			this._.outOfSync = true;
		}

		return this._.filter || null;
	},

	view: function( new_view ) {
		if( typeof new_view !== 'undefined' )	{
			if( new_view )			this._safePropSet( 'view', new_view );
			else if( this._.view )	delete this._.view;
			this._.outOfSync = true;
		}

		return this._.view || null;
	},

	extra: function() { return this._.extra || {}; },

	refresh: function( depth ) {
		this._.outOfSync = true;
		return this.get( '', depth );
	}
} );

dojo.declare( 'adstream.data.schema.Method', null, {} );
