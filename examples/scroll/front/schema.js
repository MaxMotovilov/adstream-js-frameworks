dojo.provide( 'app.schema' );
dojo.require( 'adstream.data.Service' );

(function() {
	var ad = adstream.data,
		ads = ad.schema;
	
	app.root = adstream.data.connect( "/svc", new ads.Node({
		numbers: new ads.Container({
			item: new ads.Object(),
			filter: { contains: "" },
			view: { offset: 0, count: 0 }
		})
	}) );
})();
