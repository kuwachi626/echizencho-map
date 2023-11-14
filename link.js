$(window).on('load', function() {
    if  (navigator.userAgent.match(/iPhone|iPad.+Mobile|Macintosh/) && 'ontouchend' in document) {
        $('.test_link').attr('href','./usdz/townhall.usdz')
    }
});