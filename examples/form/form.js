dojo.provide( 'form' );

dojo.require( 'dojox.jtlc.CHT.loader' );

dojo.require( 'adstream.views.form' );
dojo.require( 'adstream.views.pushButton' );
dojo.require( 'adstream.views.validate' );
dojo.require( 'adstream.views.change' );

dojo.require( 'mockup' );

form.dataObject = {};

dojo.ready( function() {

	dojo.on( dojo.byId( 'placeholder' ), 'submit', function() {
		alert( dojo.toJson( form.dataObject ) );
	} );

	dojo.when(
		dojox.jtlc.CHT.loader.get( 'form.Test' )( form.dataObject ).render( 'placeholder', 'only' ),
		function(){},
		function( err ) { console.log( err.toString(), err.stack ); }
	);
} );
