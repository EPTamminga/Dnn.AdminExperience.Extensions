import React, { PropTypes, Component } from "react";
import { connect } from "react-redux";

import IconButton from "./IconButton";

class StatusSwitch extends Component {
    constructor(props) {
        super(props);
        
        this.state = {
        };
    }

    changeState(){
        const {props, state} = this;

        if(props.status === 3){
            return;
        }

        let status = props.status + 1;
        if(status > 2){
            status = 0;
        }

        if(typeof props.onChange === "function"){
            props.onChange(status);
        }
    }

    render() {
        const {props, state} = this;

        let type = "";
        switch(props.status){
            case 0:
                type = "unchecked";
                break;
            case 1:
                type = "checked";
                break;
            case 2:
                type = "denied";
                break;
            case 3:
                type = "lock-closed";
                break;
        }
        return (
            
            <IconButton type={type}  onClick={this.changeState.bind(this)} />
        );
    }
}

StatusSwitch.propTypes = {
    localization: PropTypes.object,
    definitions: PropTypes.object.isRequired,
    permission: PropTypes.object.isRequired,
    type: PropTypes.oneOf(["role", "user"]),
    status: PropTypes.number
};

export default StatusSwitch;