shader_type spatial;
render_mode cull_disabled;
uniform vec4 water_dark : source_color = vec4(0.12,0.40,0.43,1.0);
uniform vec4 water_light : source_color = vec4(0.30,0.63,0.62,1.0);
varying vec3 world_position;
void vertex(){world_position=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;}
void fragment(){
 float wave=sin(world_position.x*2.8+world_position.z*1.7+TIME*.65)*.5+.5;
 float ripple=sin(world_position.z*9.0+sin(world_position.x*2.0)+TIME*.8);
 float glint=pow(max(0.0,ripple),18.0)*.10;
 ALBEDO=mix(water_dark.rgb,water_light.rgb,wave*.45)+vec3(glint);
 ROUGHNESS=.42;METALLIC=.1;
}
