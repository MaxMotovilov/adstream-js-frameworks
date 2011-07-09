// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'adstream.data.schema' );

(function() {

var ad = adstream.data,
	ads = adstream.data.schema;

ad._splitURL = function( url ) {
	return /^(.*)\/([^\/]*)$/.exec( url ) || [ url, url, '' ];
}

ad._descend = function( rel_url, obj, step ) {
	step = step || _byInstance;

	var	last = null;	
	
	return {
		rel_url: rel_url.replace( /([^\/]*)(?:\/|$)/g, function(ctx,path_item) {
			if( ctx && obj ) {
				last = obj;
				obj = step( obj, path_item );
			}
			return obj ? '' : ctx;
		} ),
		obj: obj || last
	};
}

function _byInstance( obj, path_item ) {
	var	ret;
	return obj.hasOwnProperty(path_item) && 
		   (ret = obj[path_item]) instanceof ads.Node &&
		   ret;
}

ads._byAutoInstantiatedSchema = function( obj, path_item ) {
	var p;

	if( p = _byInstance( obj, path_item ) )	
		return p;

	if( (p = obj._schemaProp( path_item )) && p instanceof ads.Node )
		return obj[path_item] = p._new( obj._service, obj._composeURL( path_item ) );

	return null;
}

var	_unique_id = 0;
function _uniqueID() { return ++_unique_id; }

function _identical( a, b, ignore_schema_objects ) 
{

	if( typeof a === 'undefined' || typeof b === 'undefined' )
		return typeof a === typeof b;

	if( typeof a !== 'object' && typeof b !== 'object' )
		return a.toString() == b.toString();

	else if( typeof a !== typeof b )
		return false;

	for( var i in a )
		if( a.hasOwnProperty(i) && i != '_' && !_identical( a[i], b[i] ) )
			return false;

	for( var i in b )
		if( i != '_' && b.hasOwnProperty(i) && 
			!(ignore_schema_objects && b[i] instanceof ads.Node) && 
			!(i in a) )	
				return false;

	return true;	
}

function _mixIfNotPresent( dst, src ) 
{
	for( var i in src ) {
		if( i in src && i in dst && !_identical( src[i], dst[i] ) )
			return false;
		dst[i] = src[i];
	}
	return true;
}

function _bySchema( obj, path_item ) 
{
	var ret = obj._schemaProp( path_item );
	return ret && (ret instanceof ads.Node) && ret;
}

function _descendSchema( rel_url, obj )
{
	var d = ad._descend( rel_url, obj, _bySchema );
	if( d.rel_url )	throw Error( obj._.url + '/' + rel_url + ' does not specify an object in the schema' );
	return d.obj;
}

function _identicalProp( src, dst )
{
	if( !src ) { // null == default settings
		for( var i in dst )
			if( dst.hasOwnProperty( i ) )
				return false;
		return true;
	}

	for( var i in src )
		if( src[i] === null ? dst.hasOwnProperty( i ) : src[i] != dst[i] )
			return false;

	for( var i in dst )
		if( !( i in src ) )	return false;

	return true;
}

function _copyProp( src, dst )
{
	for( var i in dst )
		if( dst.hasOwnProperty( i ) )
			delete dst[i];

	for( var i in src )
		if( src[i] !== null )
			dst[i] = src[i];
}

dojo.declare( 'adstream.data.schema.Node', null, {

	constructor: function( sub, options, proto ) {
		this._subschema = sub || {};
		this._ = {};

		if( options ) for( var i in options )
			this['_'+i] = options[i];

		if( proto ) for( var i in proto )
			if( !( i in this ) )	
				this[i] = proto[i];

		for( var i in this._subschema ) {
			if( this._subschema[i] instanceof ads.Method )
				this[i] = this._subschema[i].body;
		}
	},

	_new: function( svc, url ) {

		if( !this.hasOwnProperty( '_subschema' ) )
			throw Error( "_new() called on an instance instead of the schema object" );

		var	impl = dojo.delegate( this, {
				_: 			dojo.delegate( this._, { url: url } ),
				_service: 	svc
			} ),
			obj = dojo.delegate( impl, {} );

		if( !(this instanceof ads.Container) && this._subschema )
			for( var i in this._subschema )
				if( this._subschema[i] instanceof ads.Container ) {
					obj[i] = this._subschema[i]._new( svc, obj._composeURL( i ) );
					obj[i]._.partial = true;
				}

		return obj;
	},

	_instantiateSchema: function() {
		for( var i in this._subschema )
			if( this._subschema[i] instanceof ads.Node ) {
				this[i] = this._subschema[i]._new( this._service, this._composeURL( i ) );
				this[i]._instantiateSchema();
			}
	},

	_composeURL: function( rel_url ) {
		return rel_url ? this._.url ? this._.url + '/' + rel_url : rel_url : this._.url;
	},

	_schemaProp: function( path_item ) {
		return this._subschema[path_item] || null;
	},

	_wrap: function( data ) {
		if( !data )	throw Error( "Attempt to save a read-only or unmodified object " + this._.url );
		var result = {};
		result[this._.url] = data;
		return result;
	},

	_marshal: function( depth ) {

		var	result = null;

		if( depth ) {
			var to = {}, item;
			for( var i in this )
				if( this.hasOwnProperty(i) &&
					this[i] instanceof ads.Node &&
					(item = this[i]._marshal( depth-1 )) ) {
					to[i] = item;
					result = to;
				}
		}

		return result;
	},

	_unmarshal: function( data ) { return false; },

	_copyProp: function( src, prop ) {
		if( this._.hasOwnProperty( prop ) )
			if( !src )	delete this._[prop];
			else		_copyProp( src, this._[prop] );
		else if( src )	this._[prop] = dojo.delegate( this._[prop], src );
	},

	_copyPropsIfChanged: function( src, props ) {
		var	any = false;

		if( src._ )	dojo.forEach( props, function(prop) {
			
			if( !( prop in src._ ) )	return;

			if( this._.hasOwnProperty( '_'+prop ) )	
				delete this._['_'+prop]; // Clobber the shadow copy

			if( typeof src._[prop] === 'object' ) {
				if( typeof this._[prop] !== 'object' )
					throw Error( prop + " is not a valid structured metadata property for " + this._.url );
				
				if( this._.hasOwnProperty( prop ) ?
						!src._[prop] || !_identicalProp( src._[prop], this._[prop] ) :
						src._[prop]
				) {
					this._copyProp( src._[prop], prop );
					any = true;
				}
			} else if( typeof this._[prop] === 'object' ) 
				throw Error( prop + " is not a valid scalar metadata property for " + this._.url );
			else if( src._[prop] != this._[prop] ) {
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
		return /(?:\/|^)@/.test( this._.url );
	},

	_URL_Params: function( depth ) { 
		var result = {};
		if( depth )
			for( var sp in this._subschema ) 
				if( !_mixIfNotPresent( 
					result, (this[sp] || this._subschema[sp])._URL_Params( depth-1 ) 
				) )
					throw Error( "URL parameters conflict in request to " + this._.url + " with depth " + depth );
		return result;
	},

	_saveIfNotCreated: function() {
		if( /@.*[\/]/.test( this._.url ) )
			throw Error( "Cannot save " + this._.url + " as its parent has not yet been saved" );
		var split_url = ad._splitURL( this._.url ),
			d = ad._descend( split_url[1], this._service.root );

		if( d.rel_url )	throw Error( "Object at " + this._.url + " is not connected to schema" );

		return d.obj.save( split_url[2] );
	},

	_itemDelete: function() {

		if( this._notYetCreated() ) {
			var	split_url = ad._splitURL( this._.url ),
				d = ad._descend( split_url[1], this._service.root );

			if( d.rel_url )	throw Error( "Object at " + this._.url + " is not connected to schema" );
		
			return d.obj.del( split_url[2] );

		} else {
			return this._service.DELETE( this._.url, { version: this._.version } );
		}
	},

	_anyChild: function( depth ) {	//	Iterates over subschema which is likely faster
		if( depth > 0 )
			for( var i in this._subschema )
				if( this.hasOwnProperty( i ) && this[i] instanceof ads.Node && 
					this[i]._isPartial( depth-1 ) )
					return true;
		return false;
	},

	_isPartial: function( depth ) {
		return this._.partial || this._anyChild( depth );
	},

	url: function() { return this._.url; },

	id: function() { return /[^\/]+$/.exec( this._.url )[0]; },
	
	service: function() { return this._service; },

	get: function( rel_url, depth, force ) {
		var	d = ad._descend( rel_url||'', this );

		if( !force && !d.rel_url && !this._isPartial( depth||d.obj._defaultGetDepth||0 ) ) 
			return d.obj;

		var	schema_obj = _descendSchema( d.rel_url, d.obj ),
			params = schema_obj._URL_Params( depth );

		if( depth = depth||schema_obj._defaultGetDepth||0 )
			params.depth = depth;

		return this._service.GET( this._composeURL( rel_url ), params );
	},

	// Retained for backward compatibility only, use watch() instead
	on_sync: function( cb, rel_url, max_depth, min_depth ) {

		if( typeof rel_url === 'number' ) {
			min_depth = max_depth || 0;
			max_depth = rel_url;
			rel_url = '';
		}

		var opt = {};
		if( max_depth )	opt.maxDepth = max_depth;
		if( min_depth )	opt.minDepth = min_depth;

		this.watch( cb, rel_url, opt );
	},

	watch: function( cb, rel_url, options ) {

		if( typeof rel_url === 'object' ) {
			options = rel_url;
			rel_url = '';
		}

		if( !options || !('maxDepth' in options) ) {
			var	d = ad._descend( rel_url||'', this ),
				ref_obj = d.rel_url ?
					_descendSchema( d.rel_url, d.obj ) : 
					d.obj;
			if( '_defaultGetDepth' in ref_obj )
				(options||(options={})).maxDepth = ref_obj._defaultGetDepth;
		}

		return this._service.watch( cb, this._composeURL( rel_url ), options );
	},

	ignore: function( rel_url ) {
		return this._service.ignore( this._composeURL( rel_url ) );
	},

	save: function( depth ) {
		if( this._notYetCreated() )
			return this._saveIfNotCreated();
		return this._service.PUT( this._.url, this._wrap( this._marshal( depth||0 ) ) );
	}
} );


dojo.declare( 'adstream.data.schema.Object', [ ads.Node ], {

	_unmarshal: function( data ) {

		if( !this._copyPropsIfChanged( data, [ 'version', 'partial' ] ) &&
			_identical( data, this, true )
		)
			return false;

		for( var i in this )
			if( this.hasOwnProperty(i) && !(this[i] instanceof ads.Node) )
				delete this[i];

		for( var i in data )
			if( i != '_' )	this[i] = data[i];

		return true;
	},

	_marshal: function( depth ) {

		if( this._readOnly )	return null;
	
		var to = {}, item;

		if( 'version' in this._ )	
			to._= { version: this._.version };

		for( var i in this ) {
			if( !this.hasOwnProperty(i) )	continue;
			if( !(this[i] instanceof ads.Node) )
				to[i] = this[i];
			else if( depth && (item = this[i]._marshal( depth-1 )) )
				to[i] = item;
		}
		
		return to;
	}

} );


dojo.declare( 'adstream.data.schema.Container', [ ads.Node ], {

	constructor: function() {
	
		if( !this._subschema.item )	
			throw Error( "Container must have an 'item' slot in its subschema" );

		this._defaultSetting( 'filter' );
		this._defaultSetting( 'view' );
		this._defaultSetting( 'extra' );

		if( 'del' in this._subschema.item )	// Container in container
				this._subschema.item._itemDel = this._subschema.item._itemDelete;
		else	this._subschema.item.del = this._subschema.item._itemDelete;
	},

	_defaultGetDepth: 1,

	_defaultSetting: function( name ) {
		if( name in this._subschema ) {
			this._[name] = this._subschema[name];
			delete this._subschema[name];
		} else	this._[name] = {};
	},

	_instantiateSchema: function() {},

	_schemaProp: function( path_item ) {
		//	Assuming that any item ID except '_' is valid
		return path_item == '_' ? null : this._subschema.item;
	},

	_unmarshal: function( data, props ) {

		var	result = this._copyPropsIfChanged( data, [ 'filter', 'view', 'extra' ] );

		for( var i in props )
			if( !props[i] ) {
				if( this.hasOwnProperty(i) ) {
					delete this[i];
					result = true;
				}
			} else if( props[i]._ && props[i]._.replaces &&
					   props[i]._.replaces in this ) {
				this[i] = this[ props[i]._.replaces ]; // URL is now fixed by Service._sync()
				delete this[ props[i]._.replaces ];
				result = true;
			} else if( !(i in this) )
				result = true;

		if( !(data._ && data._.partial) ) {
			for( var i in this )
				if( this.hasOwnProperty( i ) && !(i in props) && this[i] instanceof ads.Node ) {
					delete this[i];
					result = true;
				}
			dojo.forEach( [ 'filter', 'view' ], function( prop ) {
				if( this._.hasOwnProperty( '_' + prop ) ) {
					// Do the work of the lazy server
					result = result || !_identicalProp( this._['_' + prop], this._[prop] );
					this._copyProp( this._['_' + prop], prop );
					delete this._['_' + prop];
				}
			}, this );
			if( this._.partial )	delete this._.partial;
		}

		return result;
	},

	_marshal: function( depth ) {

		if( this._readOnly )	return null;

		var result = null, to = {}, item;

		if( depth < 0 || 		// Called on self or parent container, so it is a POST
			this._saveWithParent// Called on parent object -- mix POST data into a PUT
		) 
			for( var i in this )
				if( this.hasOwnProperty(i) && 
					( this._saveAllItems || i.charAt(0)=='@' ) &&
					(item = this[i]._marshal( -1 )) ) {
					to[i] = item;
					result = to;
				}
		
		return result;		
	},

	_URL_Params: function( depth ) {

		var result = {};
		dojo.forEach( [ 'filter', 'view' ], function(p) {
			dojo.mixin( result, this._['_'+p] || this._[p] );
		}, this );

		if( depth )
			for( var i in this ) 
				if( this.hasOwnProperty(i) && this[i] instanceof ads.Node &&
					!_mixIfNotPresent( 
						result, this[i]._URL_Params( depth-1 ) 
				) )
					throw Error( "URL parameters conflict in request to " + this._.url + " with depth " + depth );

		return result;
	},

	_isPartial: function( depth ) {
		return this._.partial || dojo.some( [ 'filter', 'view' ], function( prop ) {
			return this._.hasOwnProperty( '_'+prop ) && 
				   !_identicalProp( this._['_'+prop], this._[prop] );
		}, this ) || this._anyChild( depth );
	},

	_anyChild: function( depth ) { // Iterates over object's properties rather than subschema
		if( depth > 0 )
			for( var i in this )
				if( this.hasOwnProperty[i] && this[i] instanceof ads.Node &&
					this[i]._isPartial( depth-1 ) )
					return true;
		return false;
	},
				
	create: function() {

		if( this._readOnly )	throw Error( "Cannot create items in a read only container " + this._.url );

		var temp_id = '@' + _uniqueID(),
			result = this._subschema.item._new( this._service, this._composeURL( temp_id ) );
		result._instantiateSchema();
		return this[temp_id] = result;
	},

	_bulkOp: function( what, op ) {
		if( typeof what === 'function' ) {
			for( var i in this )
				if( this.hasOwnProperty(i) && this[i] instanceof ads.Node && what( this[i] ) )
					op.call( this, this[i] );
		} else if( what instanceof Array )
			for( var i=0; i<what.length; ++i )
				op.call( this, this[ what[i] ] );
		else op.call( this, this[what] );
	},

	del: function( what ) {

		if( !what ) {
			if( !(_itemDel in this) )	
				throw Error( "Container.del() should have a parameter if container is not an item itself" );
			return this._itemDel();
		}

		var	to_delete = [];
		this._bulkOp( what, function( item ) {
			if( item._notYetCreated() )
					delete this[item.id()];
			else	to_delete.push( item );
		} );

		if( to_delete.length == 0 )
			return null;
		else if( to_delete.length == 1 )
			return to_delete[0].del();

		// Batch delete

		var	packet = {};
		dojo.forEach( to_delete, function( item ) {
			packet[item.id()] = 'version' in item._ ? { _: { version: item._.version, 'delete': true } } : null;
		} );

		return this._service.PUT( this._.url, this._wrap( packet ), this._URL_Params( -1 ) );
	},

	save: function( what, depth ) {
		
		if( !what ) {
			if( this._notYetCreated )	return this._saveIfNotCreated();
			else	return this._service.POST( this._.url, this._wrap( this._marshal( -1 ) ), this._URL_Params( -1 ) );
		}

		if( this._notYetCreated() )
			throw Error( "Cannot save children of " + this._.url + " that has not been saved yet" );

		var to_save = []
		this._bulkOp( what, function( item ) { 
			to_save.push( item ); 
		} );

		if( to_save.length == 0 )
			return this;
		else if( to_save.length == 1 && !to_save[0]._notYetCreated() )
			return to_save[0].save( depth );

		// Batch save

		var packet = {}, any_modified = false;
		dojo.forEach( to_save, function( item ) {
			any_modified = any_modified || !item._notYetCreated();
			packet[item.id()] = item._marshal( item._notYetCreated() ? -1 : depth );
		} );

		return ( any_modified ? this._service.PUT : this._service.POST ).call( this._service, this._.url, this._wrap( packet ), this._URL_Params( -1 ) );
	},

	filter: function( new_filter ) {
		return this._vf_prop( 'filter', new_filter );
	},

	view: function( new_view ) {
		return this._vf_prop( 'view', new_view );
	},

	_vf_prop: function( prop, value ) {

		if( typeof value !== 'undefined' ) {

			var	defaults = _descendSchema( this._.url, this._service.root )._[prop];
			value = dojo.delegate( defaults, value || {} );
			for( var i in value )
				if( value.hasOwnProperty( i ) && value[i] === null )
					delete value[i];

			this._['_' + prop] = value;

		} else if( !this._.hasOwnProperty( '_' + prop ) ) {
			var	defaults = _descendSchema( this._.url, this._service.root )._[prop];
			this._['_' + prop] = dojo.delegate( defaults, this._.hasOwnProperty( prop ) ? dojo.mixin( {}, this._[prop] ) : {} );
		}

		return this._['_' + prop];
	},

	extra: function() { return this._.extra; },

	refresh: function( depth ) {
		return this.get( '', depth, true );
	}
} );

})();

dojo.declare( 'adstream.data.schema.Method', null, {} );
