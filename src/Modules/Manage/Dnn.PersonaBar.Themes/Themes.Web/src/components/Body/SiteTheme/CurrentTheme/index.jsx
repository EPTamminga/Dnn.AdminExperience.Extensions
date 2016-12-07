import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";
import SvgIcon from "../../SvgIcon";

import "./style.less";

class CurrentTheme extends Component {
    constructor() {
        super();
        this.state = {};
    }


    render() {
        const {props} = this;

        return (
            <div className="current-theme">
                {
                    (function () {
                        if (props.currentTheme && props.currentTheme.SiteLayout.thumbnail) {
                            return <img src={props.currentTheme.SiteLayout.thumbnail} />;
                        }
                        else {
                            return <SvgIcon name="EmptyThumbnail" />;
                        }
                    })()
                }
            </div>
        );
    }
}

CurrentTheme.propTypes = {
    dispatch: PropTypes.func.isRequired,
    currentTheme: PropTypes.object
};

function mapStateToProps(state) {
    return {
        currentTheme: state.theme.currentTheme
    };
}

export default connect(mapStateToProps)(CurrentTheme);