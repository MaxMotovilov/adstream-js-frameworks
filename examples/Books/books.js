dojo.provide( 'bsb.books' );

dojo.require( 'dijit._Widget' );
dojo.require( 'dijit.form.ComboBox' );
dojo.require( 'dojox.jtlc.CHT' );
dojo.require( 'adstream.data.Service' );

bsb.downloaded_templates = dojo.xhrGet( { url: 'books.cht' } ).then( 
	function(v){ return bsb.downloaded_templates = v; } 
);

bsb.templates = new dojo.Deferred();

function compileTemplates( input )
{
	bsb.cht = new dojox.jtlc.CHT(),
	bsb.compiled_templates = bsb.cht.parse( input );
	bsb.i18nDictionary = {};
	bsb.downloaded_templates = true;

	var promise = bsb.templates;
	promise.resolve( bsb.templates = {} );

	return true;
}

function getTemplate( name )
{
	return bsb.templates[name]||(
		bsb.templates[name] = dojox.jtlc.compile( bsb.compiled_templates[name], bsb.cht, { i18nDictionary: bsb.i18nDictionary } )
	);
}

dojo.ready( function() {

	var ads = adstream.data.schema;

	bsb.root = adstream.data.connect( '/', 
		new ads.Node( {
			books: new ads.Container( {
				item: new ads.Object(),
				view: { offset:0, count: 30 }
			} ),
			authors: new ads.Container( {
				item: new ads.Object(),
				view: { offset:0 }
			} )
		} )
	);

	dojo.when(
		dojo.when( bsb.downloaded_templates, compileTemplates ),
		dojo.hitch( bsb.topControls, bsb.topControls.connectData )
	);
} );

dojo.declare( 'bsb.TopControls', dijit._Widget, {

	constructor: function() {
		dojo.mixin( this, {
			displayOffset: 	0,
			lastViewOffset: 0,
			searching:		false,
			searchPending:  null
		} );
	},
	
	postCreate: function() {

		bsb.topControls = this;

		var _this = this;
		dojo.when( bsb.templates, function() {
			getTemplate( 'TopControls' )().place( _this.domNode );
			dojo.query( '.tab', _this.domNode ).forEach( function(tab){
				_this.connect( tab, 'onclick', _this.onclick );
			} );
			_this.connect( dojo.byId('searchBox'), 'onkeyup', _this.onSearchKeyUp );
		} );
	},

	data: null,
	selectedAuthor: null,

	contentTemplates: { authors: 'AuthorList', books: 'BookList' },

	connectData: function() {
		bsb.root.watch( dojo.hitch( this, this.refresh, 'books' ), 'books', { refreshRate: 5000 } );
		bsb.root.watch( dojo.hitch( this, this.refresh, 'authors' ), 'authors' );
		bsb.topControls.selectTab( 'books' );
	},

	onclick: function(e) {
		this.selectTab( dojo.attr( e.target, 'name' ) );
		dojo.stopEvent(e);
	},

	selectTab: function( name ) {
		if( this.selectedTab != name ) {
			this.selectedTab = name;

			dojo.query( '.tab', this.element ).forEach( function(tab){
				if( dojo.attr( tab, 'name' ) == name )	dojo.addClass( tab, 'selected' );
				else									dojo.removeClass( tab, 'selected' );
			} );

			this.displayOffset = 0;
			this.lastViewOffset = 0;

			this.refresh( name, bsb.root.get( name ) );
		}
	},
	
	refresh: function( name, data ) {
		if( name != this.selectedTab || data instanceof dojo.Deferred )	
			return;

		this.searching = false;

		if( data.view().offset != this.lastViewOffset )	{
			this.displayOffset = 0;
			this.lastViewOffset = data.view().offset;
		} else if( 'lastVisible' in this )	delete this.lastVisible;

		getTemplate( this.contentTemplates[name] )( data, this ).place( 'list', 'only' );

		var list = dojo.byId( 'list' ),
			tbl = dojo.query( 'table', list )[0],
			box = dojo.contentBox( list );

		this.displayCount = 0;

		if( 'lastVisible' in this )	{
			this.lastVisible -= this.lastViewOffset;
			this.trimBackward( tbl, box, name=='books' ? 1:0 );
		}

		this.trimForward( tbl, box, name=='books' ? 1:0 );

		this.attachPageControls( dojo.byId( 'list' ) );
	},

	_deleteRow: function( tbl, row ) {
		if( row < 0 )	row += tbl.rows.length;
		dojo.forEach( dijit.findWidgets( tbl.rows[row] ), function(w){w.destroy();} );
		tbl.deleteRow( row );
	},

	trimForward: function( tbl, box, skip ) {
		for( var i = skip; i<tbl.rows.length; ++i, ++this.displayCount ) {
			var b = dojo.marginBox( tbl.rows[i] );
			if( b.t + b.h > box.t + box.h )	break;
		}

		while( tbl.rows.length > i )
			this._deleteRow( tbl, -1 );
	},

	trimBackward: function( tbl, box, skip ) {
		var last;
		while( tbl.rows.length-1-skip >= this.lastVisible - this.displayOffset ) {
			var b = dojo.marginBox( tbl.rows[this.lastVisible - this.displayOffset + skip] );
			if( b.t + b.h > box.t + box.h )	{
				++this.displayOffset;
				this._deleteRow( tbl, skip );
			} else break;
		}

		delete this.lastVisible;
	},

	prevPage: function(e) {
		var data = bsb.root[ this.selectedTab ],
			offs = data.view().offset,
			move_total = Math.min( offs + this.displayOffset, 30 /* Big enough to fill the page */ ),
			move_now = Math.min( this.displayOffset, move_total );

		this.displayOffset -= move_now;
		move_total -= move_now;

		if( move_total ) {
			data.view( { offset: offs - move_total, count: null } );
			this.lastVisible = offs-1;
			data.get();
		}

		if( move_now )	this.refresh( this.selectedTab, data );

		dojo.stopEvent( e );
	},

	nextPage: function(e) {
		var data = bsb.root[ this.selectedTab ];
		this.displayOffset += this.displayCount;
		this.refresh( this.selectedTab, data );

		data.view( { offset: data.view().offset + this.displayOffset, count: null } );

		data.get();
		dojo.stopEvent( e );
	},

	attachPageControls: function( elt ) {
		var view = bsb.root[this.selectedTab].view();
		dojo.query( 'img[command]', elt ).forEach( function(e) {
			var	cmd = dojo.attr( e, 'command' );
			dojo.connect( e, 'onclick', this, cmd );
			if( cmd == 'prevPage' && this.displayOffset + view.offset > 0 ||
				cmd =='nextPage' && this.displayOffset + this.displayCount < view.count )
				e.style.display = 'block';
		}, this );
	},

	onSearchKeyUp: function() {
		if( this.searchPending )	dojo.global.clearTimeout( this.searchPending );
		this.searchPending = dojo.global.setTimeout( dojo.hitch( this, this.search ), this.searching ? 500 : 200 );
	},

	search: function() {	
		this.searchPending = null;
		var	data = bsb.root[this.selectedTab],
			srch = dojo.byId( 'searchBox' ).value;
		if( data.filter() && data.filter().search == srch )	return;

		data.filter( srch ? { search: srch } : null );
		data.view( { offset: 0, count: null } );

		data.get();
	}
} );

dojo.declare( 'bsb.InplaceEditField', dijit._Widget, {

	postCreate: function() {
		this.onclick_cookie = [	this.connect( this.domNode, 'onclick', this.onclick ) ];
		var img = dojo.query( 'img', this.domNode )[0];
		if( img )	this.onclick_cookie.push( this.connect( img, 'onclick', this.deleteMe ) );
	},

	data: null,
	editTemplate: '',
	displayTemplate: '',
	field: '',

	onclose: function(){},

	onclick: function(e) {
		dojo.forEach( this.onclick_cookie, dojo.hitch( this, this.disconnect ) );
		getTemplate( this.editTemplate )( this.data, e.target ).place( e.target, 'before' );
		e.target.style.visibility = 'hidden';
		this.editor = e.target.previousSibling;
		dojo.forEach( [ 'onchange', 'onblur', 'onfocus' ],
			function(evt) {	this.connect( this.editor, evt, evt ); }, this
		);
		this.editor.focus();
		dojo.stopEvent(e);
	},

	onchange: function( event ) {
		this.data[this.field] = event.target.value;
	},

	onfocus: function( event ) {
		if( this.closingTimer ) {
			dojo.global.clearTimeout( this.closingTimer );
			delete this.closingTimer;
		}
	},

	onblur: function( event ) {
		this.closingTimer = dojo.global.setTimeout( dojo.hitch( this, 'closeEditor' ), 0 );
	},

	closeEditor: function() {
		this.data.save();
		this.onclose();
		getTemplate( this.displayTemplate )( this.data ).place( this.editor.parentNode, 'only' );
	},

	deleteMe: function(e) {
		if( confirm( dojo.attr( e.target, 'prompt' ) ) ) {
			this.data.del();
			
		}
		dojo.stopEvent(e);
	}
} );

dojo.declare( 'bsb.NewBookPane', dijit._Widget, {

	postCreate: function() {
		this.onclick_cookie = this.connect( this.domNode, 'onclick', this.onclickInit );
	},

	onclickInit: function(e) {
		this.disconnect( this.onclick_cookie );
		dojo.when( bsb.root.get( 'authors' ), dojo.hitch( this, this.openEditor ) );
		dojo.stopEvent(e);
	},

	onclickDone: function(e) {
		dojo.forEach( this.onclick_cookie, dojo.hitch( this, this.disconnect ) );

		function nonempty(i) { return i }

		if( dojo.attr( e.target, 'name' )=='OK' ) {
			book = bsb.root.books.create();
			book.title = dojo.query('textarea',this.domNode)[0].value;
			book.authors = dojo.map(
				dojo.filter( this.authors, nonempty ),
				function( full_name ) {
					full_name = dojo.filter( full_name.split( /\s+/ ), nonempty );
					return { 
						lastName: full_name.length < 2 ? full_name[0] : full_name.slice( 1 ).join( ' ' ),
						firstName: full_name.length < 2 ? '' : full_name[0]
					};
				}
			);

			book.save();
		}
		
		getTemplate( 'NewBookPlaceholder' )( bsb.books, bsb.topControls ).place( this.domNode, 'only' );
		bsb.topControls.attachPageControls( this.domNode );
		this.onclick_cookie = this.connect( this.domNode, 'onclick', this.onclickInit );
		dojo.stopEvent( e );
	},

	openEditor: function(authors) {
		this.authors = [];
		getTemplate( 'NewBookPane' )( authors, this ).place( this.domNode, 'only' );
		this.onclick_cookie = dojo.query( 'button', this.domNode ).map( function(elt) {		
			return this.connect( elt, 'onclick', this.onclickDone );
		}, this );
	},

	onAuthorChanged: function( widget, index ) {
		if( !widget.value && index != this.authors.length ) {
			widget.domNode.parentNode.removeChild( widget.domNode );
		} else if( widget.value && index == this.authors.length ) {
			this.authors.push( widget.value );
			getTemplate( 'AuthorSelect' )( bsb.root.authors, this ).place( widget.domNode, 'after' );
		} else this.authors[index] = widget.value;
	}
} );

