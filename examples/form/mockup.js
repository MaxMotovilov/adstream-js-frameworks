dojo.provide( 'mockup' );

dojo.require( 'adstream.views._base' );
dojo.require( 'dijit._WidgetBase' );

(function(d){

d.declare( 'mockup.TextBox', [ dijit._WidgetBase, adstream.views.EventEmitter ], {

	slot: null,

	postCreate: function() {
		// Attach point would be preferable
		d.query( 'input[type=text]', this.domNode ).forEach(
			function( box ) {
				this.own( d.on( box, 'change', d.hitch( this, '_onChange' ) ) );
			}, this
		);
		this.inherited( arguments );
	},

	_onChange: function( evt ) {
		d.stopEvent( evt );
		if( !this._ignore ) {
			if( this.slot( evt.target.value ) == evt.target.value )
				this.emitEvent( "dataChange" );
			else {
				this._ignore = true;
				evt.target.value = this.slot() || '';
				evt.target.focus();
				this._ignore = false;
			}
		}
	}

} );

d.declare( 'mockup.MessageField', dijit._WidgetBase, {

	form: null,

	postCreate: function() {
		this.own( d.on( this.domNode, 'validationFailed', d.hitch( this, '_onValidationFailed' ) ) );
		this.own( this.form.on( 'dataChange', d.hitch( this, '_onFormChanged' ) ) );
		this.inherited( arguments );
	},

	_onValidationFailed: function( evt ) {
		d.stopEvent( evt );
		if( evt.message )
			// Attach point would be preferable
			d.query( 'span._messageField', this.domNode ).forEach(
				function( span ){ span.innerHTML = evt.message; }
			);
	},

	_onFormChanged: function() {
		d.query( 'span._messageField', this.domNode ).forEach(
			function( span ){ span.innerHTML = ""; }
		);
	}
} );

})(dojo);
