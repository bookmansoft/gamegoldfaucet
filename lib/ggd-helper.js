document.addEventListener("DOMContentLoaded", function() {   
	$.ajax({
    type: "GET",
    url: "/balance",
    async: true,
    cache: false,
		success: function callFunction(result) {
      $("#faucetBalance").html('<h3>Faucet balance is ' + result + ' GameGold</h3>');
      // 注意:获取balance跨域了,必须在获取余额后刷新验证码,这样才能保证session中有验证码信息.
      refreshCaptcha(); 
		},
		error: function (xhr, status, error) {
      console.log("Faucet balance retrieval error.");      
		}
	});
	
	function refreshCaptcha(){
    $("#captchaImg").attr("src","");
		$("#captchaImg").attr("src", "/captcha.jpg#" + (new Date).getTime());
    $("#captchaImgDiv").css("display", "block");
    $("#toGgdResult").html("");
	}

	$( "#btnRefresh" ).click(function() {    
    refreshCaptcha();		
  	})

	$( "#toGgdBtn" ).click(function() {
		try {
			var ggdAddress = $( "#GgdAddress" ).val();
      var captchaText = $( "#captchaInputText" ).val();
			$.ajax({
            	type: "POST",
              url: "/",              
            	cache: false,
              data: {"ggdAddress" : ggdAddress, "captcha": captchaText},
              xhrFields: {
                withCredentials: true},
              crossDomain: true,
				success: function callFunction(result) {
					$("#toGgdResult").html('<h3>' + result + '</h3>');
					$("#toGgdForm").hide();
				},
				error: function (xhr, status, error) {
					var errorMsg;
  					if(xhr.responseText === undefined || xhr.responseText === '' || xhr.responseText === null) {
  						errorMsg = error.toString();
  					} else {
  						errorMsg = xhr.responseText;
  					}
					$("#toGgdResult").html('<h3 class="has-error">' + errorMsg + '</h3>');
				}
            });
		} catch(err) {
			$("#toGgdResult").html('<h3 class="has-error">' + err.message + '</h3>');
		}
	});
});
