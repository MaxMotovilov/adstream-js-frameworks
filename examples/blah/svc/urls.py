from django.conf.urls.defaults import patterns, include, url
import service
                        
urlpatterns = patterns('',
    ( r'^(.*)$', service.endPoint)
)
